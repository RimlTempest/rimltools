# デプロイ手順

## 1. 初回セットアップ（1 回だけ）

### Cloudflare リソースを作る

```bash
bunx wrangler d1 create qrcc
bunx wrangler kv namespace create CACHE
bunx wrangler r2 bucket create qrcc-artifacts
```

出力された ID を次の 2 ファイルの `REPLACE_ME` に書き込む。

- `apps/web/wrangler.jsonc`
- `apps/api/wrangler.jsonc`

**D1 の `database_id` は両方で同じもの**を指す（同一 DB を 2 つの Worker から使う）。

### R2 と KV は作らない

**R2 を有効化してはならない**（[ADR-0009](adr/0009-stay-on-workers-free.md)）。
R2 だけは利用上限を設定できず、超過分が従量課金される。有効化には支払い方法の
登録が要るので、**登録しない限り構造的に課金されない**。KV も用途が無いので作らない。

必要なのは **D1 だけ**。

### D1 のマイグレーション

`database_id` を書き込んだら、本番の D1 にスキーマを当てる。

```bash
bunx wrangler d1 migrations apply qrcc --remote --config apps/api/wrangler.jsonc
```

ローカル（Miniflare）側は **e2e の起動手順に組み込まれている**ので手で当てる必要はない
（`e2e/playwright.config.ts` の `webServer` が `bun run --filter @qrcc/web db:local` を実行する）。
手で当てたい場合は:

```bash
cd apps/web && bunx wrangler d1 migrations apply qrcc --local
```

> マイグレーションを手順書に頼ると「CI では落ちるが手元では通る」差が生まれる。
> 一度当てた手元だけ通ってしまうため、起動手順に含めてある。

### シークレット

```bash
bunx wrangler secret put BETTER_AUTH_SECRET   --config apps/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_ID     --config apps/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/web/wrangler.jsonc
```

`BETTER_AUTH_SECRET` は `openssl rand -base64 32` などで生成する。

Google OAuth の設定（Google Cloud Console）:

- 承認済みリダイレクト URI: `https://qrcc.riml4i.com/api/auth/callback/google`
- ローカル用（`vite dev`）: `http://localhost:5173/api/auth/callback/google`
- ローカル用（`vite preview` / e2e）: `e2e/playwright.config.ts` が決めるポート

**Google の資格情報が未設定の環境では、Google のボタンを出さずゲストのみになる**
（実装済みのフォールバック）。開発中はそのままで困らない。

### 未実装の運用タスク

- 期限切れゲストの掃除（[ADR-0004](adr/0004-auth-guest-and-google.md) の Cron）。
  `session.expires_at` にインデックスは張ってあるので、Cron トリガーを足すときに使う。

### カスタムドメイン

`qrcc.riml4i.com` を `qrcc-web` の custom domain として登録する
（`apps/web/wrangler.jsonc` の `routes` に定義済み）。
DNS は Cloudflare が自動で CNAME を作る。

### GitHub Actions

リポジトリの Secrets に登録する。

| Secret                  | 内容                                                 |
| ----------------------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workers Scripts:Edit / D1:Edit 権限（R2・KV は不要） |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID                                        |

登録後、`.github/workflows/deploy.yml` の `push` トリガーのコメントを外す。

## 2. 通常のデプロイ

`main` にマージすると Deploy ワークフローが動く（上記を有効化後）。
手動実行は Actions タブの「Deploy」→ Run workflow。

手元から直接デプロイする場合:

```bash
bun run build
bunx wrangler d1 migrations apply qrcc --remote --config apps/api/wrangler.jsonc
bunx wrangler deploy --config apps/web/wrangler.jsonc
```

`qrcc-api` は auxiliary Worker なので、**entry Worker (`qrcc-web`) のデプロイに
含まれる**。個別にデプロイしない（ADR-0002）。

## 3. ロールバック

```bash
bunx wrangler deployments list --name qrcc-web
bunx wrangler rollback --name qrcc-web --message "理由"
```

D1 のマイグレーションは前方移行のみ運用しているため、
スキーマを戻す必要が出た場合は「打ち消すマイグレーションを追加する」。

## 4. 運用監視

両 Worker とも `observability.enabled = true`。

```bash
bunx wrangler tail --name qrcc-web
bunx wrangler tail --name qrcc-api
```

無料枠の消費状況は Cloudflare ダッシュボードの Workers → Metrics で確認し、
`docs/free-tier-budget.md` の閾値を超えたら縮退フラグを立てる。
