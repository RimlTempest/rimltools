---
name: noter-architecture
description: noter の構成と拡張手順。どこに何を置くか迷ったとき、機能を追加するとき、Worker / Durable Object 間の境界や無料枠の制約に関わる変更をするときに読む。文書種別（フォーマット）/ 共有ロール / 同期プロトコルのメッセージ / ログイン方法 / D1 列の追加レシピと、越えてはいけない境界を定義する。「どのパッケージに置く」「Durable Object でやるか web Worker でやるか」「D1 に列を足す」「新しいフォーマットを対応させたい」で発火。
---

# noter の構成と拡張

全体像は [docs/architecture.md](../../../docs/architecture.md)、
決定の理由は [docs/adr/](../../../docs/adr/) にある。ここは**手を動かす手順**。

## 1. 置き場所の判断

| 書こうとしているもの                                     | 置き場所                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| 全 feature 共通の型・`Result`・ID・Brand                 | `shared/contract`（実装依存ゼロ。誰もが import する）      |
| ある feature の公開型・エラー型                          | `features/<name>/contract`                                 |
| I/O のない TS ロジック（Yjs の純粋操作を含む）           | `features/<name>/core`                                     |
| D1 / Better Auth に触るサーバ側コード                    | `features/<name>/server`                                   |
| Durable Object（WebSocket・DO storage・alarm）           | `features/sync/worker`（class はここだけ）+ `services/sync`    |
| ブラウザ側の同期クライアント（WebSocket・再接続）        | `features/sync/client`                                     |
| 画面（router 非依存）                                    | `features/<name>/ui/*-screen.tsx`                          |
| ルート定義・env・composition root                        | `features/<name>/ui/*.route.tsx` / `*-wiring.route.ts`     |
| 再利用する UI 部品・トークン・テーマ                     | `shared/ui`                                                |
| yaml / toml / json / markdown の解析・整形・診断         | `features/formats/core`                                    |
| WebMCP ツール定義                                        | `shared/webmcp`（登録）+ `features/<name>/ui`（実体）      |

**判断基準**:
「文書の中身に触る計算」はブラウザ（Worker を消費しない）、
「誰が・どの文書に・どの権限で」は web Worker（D1）、
「同じ文書を開いている全員に届ける」だけが Durable Object。
DO にロジックを寄せたくなったら、まずブラウザでできないかを疑う。

## 2. 越えてはいけない境界

- `shared/contract` と `features/*/contract` は**何にも依存しない**。ここに実装を書かない。
- `features/<name>/core` に **I/O を書かない**。時計・乱数・fetch・storage・WebSocket は
  すべて引数で受け取る。
- `services/sync` の `wrangler.jsonc` に **`routes` を追加しない。`workers_dev` は `false`**。
  DO は web Worker の binding 経由でしか到達できないことが認可の前提
  （[ADR-0002](../../../docs/adr/0002-auxiliary-worker-and-private-durable-object.md)）。
- **DO は認可しない。web Worker が認可し、役割をヘッダで渡す。**
  DO はヘッダを信じてよい（到達経路が binding のみだから）。逆に web Worker 側の
  `/ws/` ハンドラで役割チェックを省略してはならない。
- `class` は `features/sync/worker/document-room.ts` だけ
  （[ADR-0004](../../../docs/adr/0004-durable-object-class-exception.md)）。
- DO の中で `setTimeout` / `setInterval` / 標準 `WebSocket` API を使わない。
  hibernation が効かなくなり、duration 課金枠を食い潰す
  （[ADR-0003](../../../docs/adr/0003-realtime-yjs-on-durable-objects.md)）。
- feature 同士は `@noter/<name>/<subpath>` の公開サブパス経由でのみ依存する
  （[ADR-0007](../../../docs/adr/0007-feature-colocation.md)）。
- UI から `env` や binding を直接触らない。必ず `*.route.tsx` / `*-wiring.route.ts` 経由。

CI の `guard` ジョブがこれらを検査する。

## 3. 拡張レシピ

### 新しい文書種別（フォーマット）を追加する（例: CSV）

1. `features/documents/contract/src/document-kind.ts` の `DocumentKind` union に `'csv'` を足す
2. → **ここで TS がコンパイルエラーになる**。以下を潰していく:
   - `features/formats/core/src/registry.ts` の `FormatRegistry`（Mapped Type）に
     `csv: csvSupport` を追加（`features/formats/core/src/csv.ts` を新規作成:
     `diagnose` / `format` / `extensions` / `mime`）
   - `features/editor/ui/src/language.ts` の CodeMirror 言語レジストリに 1 行追加
   - `features/formats/ui/src/preview-registry.tsx` にプレビュー（無ければ `plainPreview`）
3. `features/formats/core/src/csv.test.ts` に Small テスト（正常・空・境界・エラー枝）
4. D1 の `document.kind` は TEXT 列なのでマイグレーション不要。
   ただし `features/documents/server/src/parse-row.ts` のパーサが新値を通すことを確認
5. UI の「新規作成」メニューは `DocumentKind` を列挙して描画しているので自動で出る

**既存の `switch` を「触らなくても動く」ようにはしない。**
触らないと**コンパイルが通らない**ようにするのが本プロジェクトの設計。

### 共有ロールを増やす（例: `commenter`）

1. `features/documents/contract/src/role.ts` の `MemberRole` union に追加
2. `features/documents/core/src/permission.ts` の `can(role, action)` 表（Mapped Type）に行を追加
3. `features/sync/contract/src/role-header.ts` のパーサに通す
4. DO 側 `features/sync/core/src/inbound.ts` の「この役割が送ってよいメッセージ」表に追加
5. Small テスト: `can` の全組み合わせ（表駆動）

### 同期プロトコルにメッセージ種別を足す

`features/sync/contract/src/message.ts` の `MessageType` に追加し、
`features/sync/core/src/inbound.ts`（サーバ）と `features/sync/client/src/provider.ts`
（クライアント）の両方の `switch` を埋める。**y-websocket 互換の 0 / 1 / 3 は変えない**
（[ADR-0013](../../../docs/adr/0013-y-websocket-wire-compatibility.md)）。
独自種別は 100 以上を使う。

### 新しいログイン方法を追加する

Better Auth のプラグインを `features/auth/server/src/auth-options.ts` に追加し、
必要なら `services/web/migrations/` にマイグレーションを 1 本足す。
アプリ本体のコードは変更しない（[ADR-0010](../../../docs/adr/0010-auth-guest-and-google.md)）。

### D1 に列を足す

1. `services/web/migrations/NNNN_<説明>.sql` を**追加**する（既存を編集しない）
2. 読み出し側のパース関数（`features/<name>/server/src/parse-row.ts`）を更新し、
   **古い行でも壊れない**ようにする（新列は必ず nullable かデフォルト付き）
3. ロールバック SQL は書かない（前方移行のみ運用）

### DO の SQLite スキーマを変える

1. `features/sync/core/src/schema.ts` の `SCHEMA_VERSION` を上げ、`migrate(sql)` に
   `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` を**追記**する
2. DO の constructor で `ctx.blockConcurrencyWhile(() => migrate(...))` が走る。
   既存 DO は次回起動時に追随する。**古い状態を読めなくする変更は禁止**
3. Small テスト: `bun:sqlite` に旧スキーマを作ってから `migrate` を当て、読めることを確認

## 4. 無料枠に効く変更かを毎回確認する

新機能を足すときは [docs/free-tier-budget.md](../../../docs/free-tier-budget.md) の
表に照らして、次を自問する。

- この操作は **web Worker のリクエスト**を増やすか？ → ブラウザ側でできないか
- **DO へのメッセージ**を増やすか？ → クライアントでまとめて（バッチ）送れないか。
  受信 20 メッセージ = 1 リクエスト、送信は無料
- DO の **rows written** を増やすか？ → alarm で集約できないか。1 更新 1 行は禁止
- DO を **hibernation できなくする**か？ → `setTimeout` / 待ち続ける Promise がないか
- D1 の行読み取り・書き込みを増やすか？ → 一覧に列を足すより JSON 列に入れられないか
- **R2 / KV を使おうとしていないか** → 使わない（[ADR-0009](../../../docs/adr/0009-free-tier-d1-and-do-only.md)）

答えが「増える」なら、`docs/free-tier-budget.md` の縮退表にも行を足す。

## 5. web Worker → Durable Object の契約

web Worker（`services/web/src/server.ts`）→ DO（`DocumentRoom`）の呼び出しは
[docs/realtime-protocol.md](../../../docs/realtime-protocol.md) が唯一の定義。
渡すヘッダは `features/sync/contract/src/headers.ts` の定数のみ。

契約を変えるときは:

1. `docs/realtime-protocol.md` を先に更新
2. `features/sync/contract` に型と定数を足す（この時点で両側のテストが落ちる = red）
3. DO 側（`features/sync/core` → `worker`）→ web 側（`services/web/src/server.ts`）→
   クライアント（`features/sync/client`）の順に実装

## 6. 迷ったら

- 抽象を足すか迷ったら足さない（YAGNI）。2 回目の重複が出てから。
- DO かブラウザか迷ったらブラウザ（無料枠を消費しないため）。
- DO か web Worker か迷ったら web Worker（D1 と認可があるのは web だけ）。
- 型で表すか実行時検証か迷ったら型。ただし組み合わせ爆発するときだけ実行時検証。
- 「消えてよい状態」か迷ったら `ctx.storage` に書く（hibernation で in-memory は消える）。
