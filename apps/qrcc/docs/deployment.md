# デプロイ手順

## 1. 初回セットアップ（1 回だけ）

### Cloudflare リソースを作る

```bash
bunx wrangler d1 create qrcc
bunx wrangler kv namespace create CACHE
bunx wrangler r2 bucket create qrcc-artifacts
```

出力された ID を次の 2 ファイルの `REPLACE_ME` に書き込む。

- `services/web/wrangler.jsonc`
- `services/api/wrangler.jsonc`

**D1 の `database_id` は両方で同じもの**を指す（同一 DB を 2 つの Worker から使う）。

### R2 と KV は作らない

**R2 を有効化してはならない**（[ADR-0009](adr/0009-stay-on-workers-free.md)）。
R2 だけは利用上限を設定できず、超過分が従量課金される。有効化には支払い方法の
登録が要るので、**登録しない限り構造的に課金されない**。KV も用途が無いので作らない。

必要なのは **D1 だけ**。

### D1 のマイグレーション

`database_id` を書き込んだら、本番の D1 にスキーマを当てる。

```bash
bunx wrangler d1 migrations apply qrcc --remote --config services/api/wrangler.jsonc
```

ローカル（Miniflare）側は **e2e の起動手順に組み込まれている**ので手で当てる必要はない
（`e2e/playwright.config.ts` の `webServer` が `bun run --filter @qrcc/web db:local` を実行する）。
手で当てたい場合は:

```bash
cd services/web && bunx wrangler d1 migrations apply qrcc --local
```

> マイグレーションを手順書に頼ると「CI では落ちるが手元では通る」差が生まれる。
> 一度当てた手元だけ通ってしまうため、起動手順に含めてある。

### シークレット

```bash
bunx wrangler secret put BETTER_AUTH_SECRET   --config services/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_ID     --config services/web/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_SECRET --config services/web/wrangler.jsonc
```

`BETTER_AUTH_SECRET` は `openssl rand -base64 32` などで生成する。

> **端末が対話的でないときは値を渡せない。** `wrangler secret put` は値を
> プロンプトで訊くので、非対話で実行すると**値を入力しないまま成功扱いで
> 登録される**（ワーカー作成の確認だけが既定の yes で答えられる）。
> 登録済みの値は API から読み出せないため、空で入ったことに後から気づけない。
> 非対話で入れるときは標準入力から渡す:
>
> ```bash
> printf '%s' "$VALUE" | bunx wrangler secret put NAME --config services/web/wrangler.jsonc
> ```

> **初回デプロイ前に `secret put` すると、空のワーカーが先に作られる。**
> ルートは付かないので公開はされないが、順番としてはデプロイを先にするほうが素直。

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
（`services/web/wrangler.jsonc` の `routes` に定義済み）。
DNS は Cloudflare が自動で CNAME を作る。

### GitHub Actions

リポジトリの Secrets に登録する。

| Secret                  | 内容                                                 |
| ----------------------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workers Scripts:Edit / D1:Edit 権限（R2・KV は不要） |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID                                        |

登録後、`.github/workflows/deploy.yml` の `push` トリガーのコメントを外す。

### デプロイ後の疎通確認

**デプロイしたら必ず走らせること。**

```bash
bun run smoke                      # 本番（既定）
bun run smoke http://localhost:5173/   # 任意のオリジン
```

HTML を取得し、そこから参照されている `/assets/*` を**全数** GET して、
1 本でも 200 以外・または中身が空なら終了コード 1 で落ちる。

> **なぜ必要か。** 一度、**エントリチャンクだけが 500 を返して**クライアント
> JS が丸ごと動かない状態が本番に残った。HTML は 200 で返り、SSR のぶんは
> 表示されるので、トップを開くだけでは気づけない。生成のライブプレビューも
> カメラも保存も動かず、`load` イベントが永久に完了しないため Lighthouse の
> 指標も壊れる。原因は Cloudflare 側のアセット配信で、再デプロイで直った。
>
> 資産が 1 本も見つからない場合も落とす。「HTML は返るがビルド成果物が
> 繋がっていない」状態を、200 だけ見て見逃さないため。

さらに、実ブラウザでの確認も用意してある。

```bash
bun run smoke:browser                                    # 本番
QRCC_SMOKE_URL=http://localhost:5173 bun run smoke:browser   # 任意のオリジン
```

HTTP 版が「配信されているか」までなのに対し、こちらは**JavaScript が動いた
結果**を見る（ハイドレーション・ブラウザ内 wasm での生成と読み取り・
Google の選択肢が出ること・qrcc-api が外から叩けないこと）。4 本で数秒。

> **本番のデータを変えない。** サインインするとゲストの user と session が
> D1 に増えるので、この spec では一切サインインしない。読み取り専用。

設定は `e2e/playwright.prod.config.ts`。通常の e2e と違い `webServer` を
持たず、既に動いているオリジンを外から叩くだけ。

`.github/workflows/deploy.yml` のデプロイ直後に、両方が入っている。

## 2. 通常のデプロイ

`main` にマージすると Deploy ワークフローが動く（上記を有効化後）。
手動実行は Actions タブの「Deploy」→ Run workflow。

手元から直接デプロイする場合:

```bash
bun run build
bunx wrangler d1 migrations apply qrcc --remote --config services/api/wrangler.jsonc
bunx wrangler deploy --config services/web/wrangler.jsonc
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
