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

### R2 のライフサイクル

一時アップロード画像を 24 時間で消す（`docs/free-tier-budget.md`）。

```bash
bunx wrangler r2 bucket lifecycle add qrcc-artifacts \
  --prefix uploads/ --expire-days 1
```

### シークレット

```bash
bunx wrangler secret put BETTER_AUTH_SECRET   --config apps/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_ID     --config apps/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/web/wrangler.jsonc
```

Google OAuth の設定（Google Cloud Console）:

- 承認済みリダイレクト URI: `https://qrcc.riml4i.com/api/auth/callback/google`
- ローカル用: `http://localhost:3000/api/auth/callback/google`

### カスタムドメイン

`qrcc.riml4i.com` を `qrcc-web` の custom domain として登録する
（`apps/web/wrangler.jsonc` の `routes` に定義済み）。
DNS は Cloudflare が自動で CNAME を作る。

### GitHub Actions

リポジトリの Secrets に登録する。

| Secret                  | 内容                                                    |
| ----------------------- | ------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workers Scripts:Edit / D1:Edit / R2:Edit / KV:Edit 権限 |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID                                           |

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
