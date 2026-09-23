# Architecture Decision Records

1 決定 = 1 ファイル。決定を変えるときは既存 ADR を書き換えず、
新しい ADR を追加して古い方に `Superseded by ADR-NNNN` を書く。

qrcc（`qrcc.riml4i.com`）から移植した決定は「qrcc ADR-NNNN を移植」と明記する。
移植元と番号は一致しない。

| #                                                           | 決定                                                              | 状態                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| [0001](0001-stack.md)                                       | TanStack Start + Cloudflare Workers/DO を TypeScript 一本で組む   | Accepted               |
| [0002](0002-auxiliary-worker-and-private-durable-object.md) | 同期 Worker を auxiliary にし、Durable Object を非公開にする      | Accepted               |
| [0003](0003-realtime-yjs-on-durable-objects.md)             | リアルタイム同期は Yjs + DO WebSocket Hibernation                 | Accepted               |
| [0004](0004-durable-object-class-exception.md)              | `class` 禁止の唯一の例外を DO の殻に限定する                      | Accepted               |
| [0005](0005-persistence-alarm-coalescing.md)                | 永続化は alarm で集約し 1 文書 1 行に書く                         | Accepted               |
| [0006](0006-typescript-7-and-oxc.md)                        | TypeScript 7 + oxlint/oxfmt を採用し ESLint/Prettier を使わない   | ルート ADR-0010 に統合 |
| [0007](0007-feature-colocation.md)                          | 機能単位の co-location でディレクトリを構成する                   | ルート ADR-0012 に統合 |
| [0008](0008-defer-rsc.md)                                   | React Server Components を当面無効にする                          | ルート ADR-0011 に統合 |
| [0009](0009-free-tier-d1-and-do-only.md)                    | Workers Free に留まり、D1 と DO SQLite 以外のストレージを使わない | Accepted               |
| [0010](0010-auth-guest-and-google.md)                       | Better Auth で匿名ゲスト + Google、後からアカウント昇格           | Accepted               |
| [0011](0011-sharing-model.md)                               | 共有はメンバー（owner/editor/viewer）と期限つきリンクで表す       | Accepted               |
| [0012](0012-webmcp.md)                                      | WebMCP は読み取り・診断のみ公開し、編集は提案 UI を経由する       | Accepted               |
| [0013](0013-y-websocket-wire-compatibility.md)              | ワイヤプロトコルは y-websocket 互換に固定する                     | Accepted               |
