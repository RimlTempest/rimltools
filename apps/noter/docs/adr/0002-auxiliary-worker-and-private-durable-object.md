# ADR-0002: 同期 Worker を auxiliary にし、Durable Object を非公開にする

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0002 を移植・改訂 / [ADR-0003](0003-realtime-yjs-on-durable-objects.md)

## 文脈

Worker は `noter-web`（SSR・認証・認可）と `noter-sync`（`DocumentRoom` DO）の 2 つ。
別々にデプロイして `sync.noter.riml4i.com` を切ると、認可を 2 箇所に持つことになり
（sync 側も Cookie を検証しなければならない）、権限昇格の穴が開きやすい。

## 決定

- `@cloudflare/vite-plugin` の **auxiliary Workers** で `noter-sync` を `noter-web` と
  同一ビルド・同一デプロイに含める
- `noter-sync` の `wrangler.jsonc` に **`routes` を書かない。`workers_dev` も `true` にしない**。
  `noter-sync` の `fetch` ハンドラは常に 404 を返す
- `noter-web` は `durable_objects.bindings` に `script_name: "noter-sync"` で `DocumentRoom` を
  binding し、**WebSocket の Upgrade は `noter-web` が認可してから DO へ渡す**
- DO は認可しない。web が付けた `X-Noter-Role` / `X-Noter-Actor` / `X-Noter-Name` を信じる

```jsonc
// apps/web/wrangler.jsonc
"durable_objects": {
  "bindings": [{ "name": "DOCUMENT_ROOM", "class_name": "DocumentRoom", "script_name": "noter-sync" }]
}
```

## 理由

- **DO はインターネットから直接到達できない**ので、web の認可を迂回できない
- 別ドメインが無いので CORS / プリフライトが無い。WebSocket も同一オリジン
- `vite dev` 1 コマンドで両 Worker が Miniflare で立ち上がる。`script_name` の DO binding は
  ローカル・リモート両方の dev で動く（Cloudflare 公式ドキュメントで確認）
- Workers Free の 100k req/日は **web の 1 リクエスト + DO の 1 リクエスト**の
  2 回消費になる。service binding 経由でも DO 呼び出しは DO のリクエストとして数えられる
  ため、Worker を分けても統合しても同じ。分ける理由が「課金」ではなく
  「DO の配置・移行を web と切り離せる」ことになる

## 帰結

- CI の `guard` ジョブが `apps/sync/wrangler.jsonc` に `routes` / `workers_dev: true` が
  無いことを検査する。**これを足すと権限昇格になる**
- `noter-sync` は D1 に `document.updated_at` の touch 以外の書き込みをしない
  （[ADR-0005](0005-persistence-alarm-coalescing.md)）。読み取りは一切しない
- web → DO のヘッダ契約は `features/sync/contract` に置き、変更は
  `docs/realtime-protocol.md` §変更手順に従う
- DO クラスの追加は `noter-sync` の `migrations` に `new_sqlite_classes` で宣言する
  （`new_classes` は Paid 限定）
