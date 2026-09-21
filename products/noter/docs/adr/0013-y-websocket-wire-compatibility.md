# ADR-0013: ワイヤプロトコルは y-websocket 互換に固定する

- 状態: Accepted
- 日付: 2026-09-06
- 関連: [ADR-0003](0003-realtime-yjs-on-durable-objects.md)

## 文脈

クライアント ↔ DO の WebSocket メッセージ形式を自前で決めるか、既存の
y-websocket（Yjs 公式のリファレンス実装）の形式に合わせるか。

自前にすると、再接続・awareness のタイムアウト・`Y.Doc` との束縛・
バイナリの組み立てをすべて自分で書き、テストすることになる。

## 決定

- **y-websocket のメッセージ形式に固定する**
  - `0` sync（y-protocols/sync: step1 / step2 / update）
  - `1` awareness（y-protocols/awareness のエンコード）
  - `3` queryAwareness
  - `2` auth は使わない（認可は Upgrade 時に web が済ませる）
  - **`100` 以上は noter 独自**。追加は `features/sync/contract/src/messages.ts` に列挙し ADR を足す
- クライアントは **`y-websocket` の `WebsocketProvider`** を使い、
  `features/sync/client` の `makeDocumentProvider(deps)` で包む
  （URL・再接続の上限・`ConnectionState` への変換・4xxx close の扱いを閉じ込める）
- サーバ（DO）は `y-protocols/sync` の `readSyncMessage` 相当を自前で書かず、
  y-protocols のエンコーダ / デコーダを使う。ただし **`Awareness` クラスは使わない**
  （[ADR-0003](0003-realtime-yjs-on-durable-objects.md)）

## 理由

- クライアントの難しい部分（再接続・バックオフ・awareness のハートビート・
  `Y.Doc` との接続）をライブラリに任せられる
- 形式が公開されているので、DO の受信フィルタ（viewer の update を捨てる等）を
  メッセージ型 1 バイトで判断できる
- 将来 y-websocket 以外の既存ツール（y-sweet など）と繋ぐ余地が残る

## 帰結

- WebSocket の URL は `wss://noter.riml4i.com/ws/:documentId`。
  `WebsocketProvider` は `${serverUrl}/${roomname}` を結合するので
  `serverUrl = '/ws'`, `roomname = documentId` で渡す
- `WebsocketProvider` の `disableBc: true`（BroadcastChannel は同一端末の
  複数タブ間同期だが、DO 経由で十分に速く、二重経路のバグ源になるため）
- `WebsocketProvider` は `4xxx` の close を「再接続すべき」と判断してしまうので、
  `makeDocumentProvider` が close code を見て `provider.shouldConnect = false` にし
  `rejected` へ遷移させる。**ここが自前で書く唯一の再接続ロジック**
- y-websocket / y-protocols のバージョンは `features/sync` 内で固定し、
  上げるときはプロトコルの互換テスト（`features/sync/core` の `wire.test.ts`）を通す
