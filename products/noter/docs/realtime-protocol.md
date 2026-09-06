# リアルタイム同期プロトコル

web Worker（`apps/web/src/server.ts`）→ `DocumentRoom`（Durable Object）→ ブラウザ
（`features/sync/client`）の契約。**この文書が唯一の定義。** 型と定数は
`features/sync/contract` に置き、両側のテストが同じ定数を読む。

## 1. 接続確立

```
ブラウザ                     noter-web (src/server.ts)                 DocumentRoom (DO)
  │ GET /ws/doc_x  Upgrade: websocket                                        │
  │  Cookie: better-auth.session_token                                       │
  ├──────────────────────────▶│                                              │
  │                           │ 1. Upgrade ヘッダ検証（無ければ 426）        │
  │                           │ 2. セッション → Actor（無ければ 401 close）  │
  │                           │ 3. D1: document + document_member → role     │
  │                           │    （メンバーでない / deleted → 404）        │
  │                           │ 4. env.DOCUMENT_ROOM.getByName(documentId)   │
  │                           │    .fetch(req + X-Noter-* ヘッダ)            │
  │                           ├─────────────────────────────────────────────▶│
  │                           │                                              │ acceptWebSocket
  │                           │                                              │ attachment = {role, actorId, name}
  │                           │◀──────────── 101 + client socket ────────────┤
  │◀──────────── 101 ─────────┤                                              │
  │◀── sync step1 ──────────────────────────────────────────────────────────┤
  │◀── 既存参加者の awareness（保存済みバイト列をそのまま） ────────────────┤
  │── sync step2 / update / awareness ──────────────────────────────────────▶│
```

### web → DO のヘッダ（`features/sync/contract/src/headers.ts`）

| ヘッダ            | 値                                  | 必須 |
| ----------------- | ----------------------------------- | ---- |
| `X-Noter-Role`    | `owner` / `editor` / `viewer`       | ○    |
| `X-Noter-Actor`   | `UserId`                            | ○    |
| `X-Noter-Name`    | 表示名（URL エンコード、≤32 文字）  | ○    |

DO はこれらを**検証せずに信じる**（到達経路が binding のみ、ADR-0002）。
ただしパースはする（不正なら 4400 で閉じる = web 側のバグ検出）。

### 拒否時の HTTP / close code

| 状況                                  | web の応答           | DO の close code |
| ------------------------------------- | -------------------- | ---------------- |
| `Upgrade` が websocket でない         | 426                  | —                |
| セッションなし（visitor）             | 401                  | —                |
| 文書なし / 削除済み / 非メンバー      | 404                  | —                |
| DO の同時接続が `MAX_MEMBERS` を超過  | —                    | 4429 `limit`     |
| 1 メッセージが `MAX_WS_MESSAGE_BYTES` 超 | —                 | 4413 `too_large` |
| ヘッダ不正                            | —                    | 4400 `bad_request` |
| 権限剥奪（後述 §5）                   | —                    | 4403 `forbidden` |

`4xxx` はクライアントが**再接続しない**コード（`ConnectionState.rejected`）。
それ以外（1006 など）は backoff 付きで再接続する。

## 2. メッセージ形式（y-websocket 互換、ADR-0013）

すべてバイナリ。先頭の varUint がメッセージ種別。

| 種別 | 名前            | 方向     | 内容                                                              |
| ---- | --------------- | -------- | ----------------------------------------------------------------- |
| 0    | sync            | 双方向   | y-protocols/sync: step1(0) / step2(1) / update(2)                 |
| 1    | awareness       | 双方向   | y-protocols/awareness の update バイト列                          |
| 3    | queryAwareness  | C → S    | 保存済み awareness を全部送り返す                                 |
| 2    | auth            | S → C    | **使わない**（権限は close code で伝える）                        |
| ≥100 | 独自拡張        | —        | 予約。追加時は ADR を書く                                         |

テキストフレームは受け付けない（`4400`）。ただし `setWebSocketAutoResponse('ping','pong')`
のテキスト `ping` は runtime が処理し、DO を起こさない。

## 3. DO の受信処理（`features/sync/core/src/inbound.ts`）

```
onMessage(socket, bytes):
  if bytes.byteLength > MAX_WS_MESSAGE_BYTES → close(4413)
  type = readVarUint
  switch type:
    0 (sync):
      sub = peekVarUint
      if sub == step1:            → reply step2（全役割）
      else (step2 / update):
        if role == viewer         → drop（何も返さない）
        else                      → applyUpdate(doc, update, origin=socket)
                                    → broadcast update to all sockets except origin
                                    → scheduler.markDirty()
    1 (awareness):
      if role == viewer           → drop
      else                        → socket.attachment.awareness = bytes（≤ 16 KB、超えたら drop）
                                  → broadcast to all sockets except origin
    3 (queryAwareness):           → 全ソケットの attachment.awareness を送る
    other                         → close(4400)
```

- **サーバは `Awareness` クラスを持たない。** y-protocols の `Awareness` は `setInterval`
  を使うため hibernation を妨げる。awareness は「最後に受け取ったバイト列」を
  ソケットの attachment に保存するだけの**中継**。
- 切断時（`webSocketClose` / `webSocketError`）は、その attachment の awareness から
  `clientID` と `clock` を読み取り、`state = null` の removal update を組み立てて
  他ソケットへ送る（`features/sync/core/src/awareness-bytes.ts` の純粋関数）。
- 送信（DO → クライアント）は無料。受信は 20 通 = 1 リクエスト。

## 4. 永続化（ADR-0005）

```
DO SQLite:
  CREATE TABLE IF NOT EXISTS document_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); -- schema_version
```

- **起動（wake）**: `blockConcurrencyWhile` で `migrate` → `document_state` を読み
  `Y.applyUpdate(doc, state)`。無ければ空文書。
- **更新**: メモリに適用 → `markDirty()`。alarm が無ければ `setAlarm(now + PERSIST_DELAY_MS)`。
- **alarm**: `dirty` なら `encodeStateAsUpdate(doc)` を 1 行 `INSERT OR REPLACE`。
  `deps.touch(documentId, updatedAt)`（D1 の `document.updated_at` を `UPDATE` 1 行、
  60 秒スロットル。`noter-sync` にも同じ D1 を binding し、失敗は無視して編集を止めない）。
- **最後のソケットが閉じた**: 即 flush（alarm を待たない）。
- **上限**: `PERSIST_DELAY_MS = 5000`。損失窓 ≤ 5 秒。クライアントの Y.Doc が
  再接続後に差分を再送するため、クライアントが生きていれば実損はない。

## 5. 権限変更の反映

権限は接続時に決まり、ソケットの attachment に固定される。共有リンク失効や
メンバー削除は **既存接続には即時反映しない**。web Worker は owner の操作時に
`env.DOCUMENT_ROOM.getByName(id).fetch('https://do/kick', { method: 'POST', body: { actorId } })`
を呼び、DO は該当 actor のソケットを `4403` で閉じる。
（DO の `fetch` は `Upgrade` と `/kick` `/snapshot` のみ受け付け、他は 404。）

## 6. スナップショット

`GET https://do/snapshot` → `text/plain; charset=utf-8` で `doc.getText('content').toString()`。
`/d/:id/raw` と WebMCP の `read-document` が使う。**DO は認可しない**ので、
web 側で `can(role, 'read')` を通してから呼ぶ。

## 7. クライアント（`features/sync/client`）

- `y-websocket` の `WebsocketProvider(wsUrl, documentId, doc, { connect: true, params: {} })`
  を薄く包む `makeDocumentProvider(deps)`。`wsUrl` は `wss://<origin>/ws`。
- `provider.on('status')` / `on('connection-close')` を `ConnectionState` に変換。
  close code が `4xxx` なら `provider.shouldConnect = false` にして `rejected`。
- awareness のローカル状態: `{ name, color, cursor }`。`color` は `actorId` のハッシュから
  `DESIGN.md` のパレット 8 色を選ぶ（同じ人は常に同じ色）。
- 送信量の制御: y-codemirror.next の既定で 1 変更 1 update。当面そのまま
  （budget: `free-tier-budget.md`）。`features/sync/client/src/batching.ts` で
  100 ms コアレスを入れる余地を残す（ADR-0013 §帰結）。

## 8. 変更手順

1. この文書を更新
2. `features/sync/contract` に型・定数を追加（両側のテストが赤になる）
3. `features/sync/core` → `features/sync/worker` → `apps/web/src/server.ts` → `features/sync/client` の順に実装
4. `e2e/tests/sync.spec.ts` に 2 コンテキストの結合テストを追加
