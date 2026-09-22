# デプロイ手順

本番: `https://noter.riml4i.com`。Worker は 2 つ（`noter-web` = entry、
`noter-sync` = auxiliary）。**auxiliary は entry に同梱されない**ので、
ビルドが生成した設定で `noter-sync` → `noter-web` の順に 2 回デプロイする。

## 1. 初回セットアップ（1 回だけ）

### Cloudflare リソースを作る

```bash
bunx wrangler d1 create noter
```

出力された `database_id` を次の 2 ファイルに書き込む（**2026-09-07 に実施済み**。
本番 D1 `noter` は APAC に作成し、ID は両ファイルにコミットしてある）。

- `services/web/wrangler.jsonc`
- `services/sync/wrangler.jsonc`

**D1 の `database_id` は両方で同じもの**を指す。`noter-sync` が D1 に行うのは
`document.updated_at` の touch（`UPDATE` 1 行、60 秒スロットル）だけで、
読み取りも認可もしない（[ADR-0005](adr/0005-persistence-alarm-coalescing.md)）。

### R2 と KV は作らない

**R2 を有効化してはならない**（[ADR-0009](adr/0009-free-tier-d1-and-do-only.md)）。
R2 だけは利用上限を設定できず、超過分が従量課金される。有効化には支払い方法の
登録が要るので、**登録しない限り構造的に課金されない**。KV も作らない。

必要なのは **D1 と Durable Object（SQLite backed）だけ**。DO は
`wrangler.jsonc` の `migrations[].new_sqlite_classes` で宣言するだけで、
ダッシュボードで作るものは無い。

> Durable Object は Workers Free で使える。ただし **`new_classes`（KV backed）は
> Paid 限定**なので、必ず `new_sqlite_classes` を使うこと。CI の `guard` が検査する。

### D1 のマイグレーション

```bash
bunx wrangler d1 migrations apply noter --remote --config services/web/wrangler.jsonc
```

ローカル（Miniflare）側は e2e の起動手順に組み込まれている
（`e2e/playwright.config.ts` の `webServer` が `bun run --filter @noter/web db:local`
を実行する）。手で当てる場合:

```bash
cd services/web && bunx wrangler d1 migrations apply noter --local
```

### シークレット

```bash
bunx wrangler secret put BETTER_AUTH_SECRET   --config services/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_ID     --config services/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_SECRET --config services/web/wrangler.jsonc
```

`BETTER_AUTH_SECRET` は `openssl rand -base64 32` で生成する。
`noter-sync` にシークレットは無い。

> **端末が対話的でないときは値を渡せない。** `wrangler secret put` は値を
> プロンプトで訊くので、非対話で実行すると**値を入力しないまま成功扱いで
> 登録される**。登録済みの値は API から読み出せないため、空で入ったことに
> 後から気づけない。非対話で入れるときは標準入力から渡す:
>
> ```bash
> printf '%s' "$VALUE" | bunx wrangler secret put NAME --config services/web/wrangler.jsonc
> ```

> **初回デプロイ前に `secret put` すると、空のワーカーが先に作られる。**
> 順番としてはデプロイを先にするほうが素直。

Google OAuth の設定（Google Cloud Console）:

- 承認済みリダイレクト URI: `https://noter.riml4i.com/api/auth/callback/google`
- ローカル用（`vite dev`）: `http://localhost:5173/api/auth/callback/google`

**Google の資格情報が未設定の環境では、Google のボタンを出さずゲストのみになる。**
開発中はそのままで困らない。

### カスタムドメイン

`noter.riml4i.com` を `noter-web` の custom domain として登録する
（`services/web/wrangler.jsonc` の `routes` に定義済み）。DNS は Cloudflare が自動で作る。

**`services/sync/wrangler.jsonc` には `routes` も `workers_dev: true` も書かない**
（[ADR-0002](adr/0002-auxiliary-worker-and-private-durable-object.md)）。
`noter-sync` の `fetch` は常に 404 を返し、DO は `noter-web` の binding からしか届かない。

### GitHub Actions

リポジトリの Secrets に登録する。

| Secret                  | 内容                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workers Scripts:Edit / D1:Edit / Durable Objects 権限（R2・KV は不要） |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID                                                          |

登録後、`.github/workflows/deploy.yml` の `push` トリガーのコメントを外す。

### デプロイ後の疎通確認

**デプロイしたら必ず走らせること。**

```bash
bun run smoke                         # 本番（既定）
bun run smoke http://localhost:5173/  # 任意のオリジン
```

HTML を取得し、参照されている `/assets/*` を**全数** GET して 1 本でも
200 以外・空なら終了コード 1 で落ちる。加えて `GET /ws/doc_000…` が
`426`（Upgrade 無し）を返すことを確認し、WebSocket 経路が配線されている
ことを検査する。

> **なぜ必要か。** qrcc で一度、**エントリチャンクだけが 500 を返して**
> クライアント JS が丸ごと動かない状態が本番に残った。HTML は 200 で返り
> SSR のぶんは表示されるので、トップを開くだけでは気づけない。noter では
> クライアント JS が死ぬと編集そのものができない。

実ブラウザでの確認:

```bash
bun run smoke:browser                                       # 本番
NOTER_SMOKE_URL=http://localhost:5173 bun run smoke:browser  # 任意のオリジン
```

こちらは**JavaScript が動いた結果**を見る（トップのハイドレーション・
サインイン画面に「ゲストのまま続ける」が出ること・`/ws/` が 426 を返すこと）。
`/assets/` は dev サーバには無いので、手元で試すときは `bun run preview` 等の
ビルド済みオリジンを使う。

spec が見ないもの（デプロイ後に人が確認する）:

- `/sign-in` に **「Google でログイン」が出ている**こと。資格情報は本番にしか
  無いので手元では再現できない（未設定ならゲストのみになる — §シークレット）
- **`https://noter-sync.<account>.workers.dev` が解決しない / 404 である**こと。
  account 名が要るので spec には入れていない（ADR-0002）
- PWA: DevTools → Application → Manifest にアイコンが 4 つ出ていて、
  Service Worker が `noter-shell-v1` で `activated` になっていること。
  SW は本番ビルドでしか登録されない（dev では登録しない）

> **本番のデータを変えない。** サインインするとゲストの user と session が
> D1 に増えるので、この spec では一切サインインしない。読み取り専用。

設定は `e2e/playwright.prod.config.ts`。`webServer` を持たず、既に動いている
オリジンを外から叩くだけ。

### 初回セットアップの記録（2026-09-07）

qrcc と同じ手順で、**手元の wrangler から**ブートストラップした。

| 項目                                           | 状態                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| D1 `noter`（APAC）+ マイグレーション 2 本      | 済                                                         |
| `noter-sync` デプロイ（targets 無し = 非公開） | 済                                                         |
| `noter-web` デプロイ + `noter.riml4i.com`      | 済（custom domain は deploy が自動登録）                   |
| `BETTER_AUTH_SECRET`                           | 済（`openssl rand` を標準入力から渡した）                  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`    | 済（`/sign-in` に Google ボタンが出る）                    |
| GitHub Secrets                                 | 済（`push` トリガー有効、`main` への push で自動デプロイ） |
| smoke（HTTP 全資産 + `/ws` 426）               | 合格                                                       |
| smoke:browser（3 本）                          | 合格                                                       |
| `noter-sync.<account>.workers.dev`             | 解決しない（非公開を確認）                                 |

初回デプロイ時の `noter-web` のアップロードは **gzip 2.4 MiB**（Free の上限は
3 MiB）。大半は server bundle に入る CodeMirror（`plans/README.md` の検討項目）。
依存を足すたびに `wrangler deploy` の `Total Upload` を見て、2.7 MiB を超えたら
`ssr: false` のルート分割を先にやる。

## 2. 通常のデプロイ

`main` にマージすると Deploy ワークフローが動く。手動実行は Actions タブの
「Deploy」→ Run workflow。

手元から直接デプロイする場合:

```bash
bun run build
bunx wrangler d1 migrations apply noter --remote --config services/web/wrangler.jsonc
bunx wrangler deploy -c services/web/dist/noter_sync/wrangler.json   # 先に DO を持つ側
bunx wrangler deploy -c services/web/dist/server/wrangler.json       # 次に entry
```

> **元の `wrangler.jsonc` を直接渡さない。** `main` が framework の仮想エントリ
> （またはソースの `src/server.ts`）を指しているので "entry-point file was not found"
> で落ちる。デプロイにはビルドが `services/web/dist/` に生成した `wrangler.json` を渡す。
>
> **順序は `noter-sync` → `noter-web`。** `noter-web` の DO binding は
> `script_name: "noter-sync"` を参照するため、先に `noter-sync` が存在している
> 必要がある（qrcc で service binding について同じ理由で確認済み）。
> `.github/workflows/deploy.yml` はこの順で書いてある。

> **デプロイは接続中の WebSocket をすべて切る。** DO のインスタンスが
> 入れ替わるため。クライアントは自動再接続し（`reconnecting` → `connected`）、
> 切断中の編集はローカルに溜めて再接続後に送るので**編集内容は失われない**。
> ただし DO が最後の alarm から 5 秒以内に落ちた場合、その 5 秒ぶんの更新は
> クライアントの再送で復元される（クライアントが全員閉じていた場合のみ失う）。
> `docs/realtime-protocol.md` §永続化。

### DO のスキーマを変えるとき

`features/sync/core/src/schema.ts` の `SCHEMA_VERSION` を上げ、`migrate` に
段階を足す。DO の SQLite は wake 時に `blockConcurrencyWhile` で自動移行する。
**DO クラスの改名・削除は `migrations` に `renamed_classes` / `deleted_classes`
を書く**（黙って消すと全文書の状態が消える）。

## 3. ロールバック

```bash
bunx wrangler deployments list --name noter-web
bunx wrangler rollback --name noter-web --message "理由"
```

- D1 は前方移行のみ。戻すなら「打ち消すマイグレーションを追加する」
- DO の SQLite も同様。`SCHEMA_VERSION` を下げない。旧コードが新スキーマを
  読めるように、列の追加のみで済ませる

## 4. 運用監視

両 Worker とも `observability.enabled = true`。

```bash
bunx wrangler tail --name noter-web
bunx wrangler tail --name noter-sync
```

無料枠の消費は Cloudflare ダッシュボードの Workers → Metrics と
Durable Objects → Metrics で確認し、`docs/free-tier-budget.md` の閾値を
超えたら縮退フラグ（`PERSIST_DELAY_MS` の引き上げ、新規文書作成の停止）を
立てる。

### 未実装の運用タスク

- 期限切れゲストと `deleted_at` から 30 日過ぎた文書の掃除
  （[ADR-0010](adr/0010-auth-guest-and-google.md) の Cron）。
  `session.expires_at` と `document.deleted_at` にインデックスを張ってある
- 文書削除時の DO 状態の破棄（`/purge` 内部ルート）。削除から 30 日は
  復元できるようにするため、掃除 Cron と同時に入れる
