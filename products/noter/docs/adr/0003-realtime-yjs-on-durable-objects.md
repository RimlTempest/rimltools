# ADR-0003: リアルタイム同期は Yjs + DO WebSocket Hibernation

- 状態: Accepted
- 日付: 2026-09-06
- 関連: [ADR-0001](0001-stack.md) / [ADR-0005](0005-persistence-alarm-coalescing.md) /
  [ADR-0013](0013-y-websocket-wire-compatibility.md)

## 文脈

複数人が同じ文書を同時に編集して収束させる方式には OT（Operational Transformation）
と CRDT がある。OT は中央サーバが変換順序を決めるため、サーバのロジックが厚く
オフライン編集が難しい。CRDT はクライアント同士が更新を交換するだけで収束する。

Cloudflare Durable Object には WebSocket Hibernation API があり、接続を保ったまま
DO のメモリを解放できる。ただし **`setInterval` / `setTimeout` を持つ DO は休止できない**。

## 決定

- CRDT は **Yjs**（`Y.Doc`、本文は `Y.Text('content')`）。クライアントは
  `y-codemirror.next` でエディタに束縛する
- 1 文書 = 1 `DocumentRoom` DO。`idFromName(documentId)` で決定的に引く
- DO は **WebSocket Hibernation API**（`ctx.acceptWebSocket`、`webSocketMessage` /
  `webSocketClose` / `webSocketError`）を使う。標準 `WebSocket` API（`addEventListener`）は使わない
- ping/pong は `setWebSocketAutoResponse` で DO を起こさずに返す
- **DO はサーバ側に `Awareness`（y-protocols）を持たない。** awareness のバイト列は
  そのまま全員に中継し、各ソケットの最新 awareness を `ws.serializeAttachment` に保存する。
  切断時は clientID と clock から「離脱」更新を DO が合成して配る
- DO のメモリ上の `Y.Doc` は**いつ消えてもよい**。wake 時に SQLite から復元する
  （[ADR-0005](0005-persistence-alarm-coalescing.md)）
- ロール `viewer` の sync step2 / update / awareness は DO が捨てる（読み取り専用）

## 理由

- Yjs は CodeMirror / ProseMirror などとの束縛が揃っていて、オフライン編集・
  再接続後の差分同期・undo が標準で動く
- Hibernation を使わないと **接続 1 本ごとに DO が常駐**し、GB-s の無料枠
  （13,000 GB-s/日）を待機時間で食い潰す。休止すれば接続があっても課金されない
- `Awareness` クラスは内部で `setInterval` を使い、DO の休止を妨げる。サーバに
  awareness の「意味」は要らず、中継とタイムアウト処理だけで足りる
- ping/pong の自動応答は DO を起こさない（リクエストとして数えられない）

## 帰結

- 更新（sync step2 / update）は **DO に届いたら即メモリに適用し、他の全ソケットへ中継**する。
  順序は DO のシングルスレッドが保証する
- DO 内で `setTimeout` / `setInterval` を書いてはならない。遅延処理は `setAlarm`
- 各ソケットの attachment（role / actorId / name / awareness）は 16 KB 以内に収める
- 受信メッセージは `MAX_WS_MESSAGE_BYTES`（256 KiB）で切る。超えたら 4413 で閉じる
- クライアントの再接続・awareness・メッセージ組み立ては y-websocket の
  `WebsocketProvider` に任せる（[ADR-0013](0013-y-websocket-wire-compatibility.md)）
- DO は Free の 100k req/日を WebSocket 受信 20 通 = 1 req で消費する。
  予算は `docs/free-tier-budget.md`
