# ADR-0002: Rust バックエンドを auxiliary Worker に分離する

- 状態: Accepted
- 日付: 2026-09-01

## 文脈

フロントエンド（TanStack Start / TypeScript）とバックエンド（Rust）を
Cloudflare 上でどう配置するか。素朴には 2 つの Worker を別々にデプロイし、
`api.qrcc.riml4i.com` を切って HTTP で呼ぶ形になるが、

- 追加のリクエスト課金（無料枠 100k/日を 2 回消費する）
- CORS・プリフライト
- 認証情報の転送
  がすべてコストになる。

## 決定

`@cloudflare/vite-plugin` の **auxiliary Workers** を使い、
`qrcc-api`（Rust）を `qrcc-web`（entry）の service binding として同一
ビルド・同一デプロイに含める。

```ts
// apps/web/vite.config.ts
cloudflare({
  viteEnvironment: { name: 'ssr' },
  auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }],
})
```

`qrcc-api` の `wrangler.jsonc` には `routes` を書かない。
インターネットから直接到達できず、`qrcc-web` の service binding からのみ呼ばれる。

## 理由

- **service binding 経由のサブリクエストには追加のリクエスト課金がない。**
  無料枠 100k/日を 1 回だけ消費する。
- 同一ドメインなので CORS もプリフライトも発生しない。
- ローカル開発が `vite dev` 1 コマンドで両 Worker とも立ち上がる（Miniflare）。
- Rust Worker を非公開にできるため、**認可は `qrcc-web` に一元化**できる。
  `qrcc-api` は「呼び出し元は認証済み」を前提にしてよく、認可ロジックを二重に
  持たずに済む。

## 帰結

- `qrcc-api` は自前で認証しない。RPC の引数として検証済み `UserId` を受け取る。
  この前提を破ると権限昇格になるため、`qrcc-api` の `wrangler.jsonc` に
  `routes` を追加してはならない（CI でチェックする）。
- Vite 7 以上が必須。
- Rust のビルド（`worker-build`）を Vite のビルドパイプラインに載せる必要がある。
  `apps/api/package.json` の `build` スクリプトから `worker-build --release` を呼ぶ。
- 障害の切り分けはログのタグで行う。両 Worker とも `observability.enabled = true`。
