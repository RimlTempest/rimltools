# infra/terraform

Cloudflare と GitHub のリソースを Terraform で管理する（ADR-0005）。
state は HCP Terraform Free に置き、plan / apply は GitHub Actions（`.github/workflows/terraform.yml`）の runner で行う。

| ファイル                     | 中身                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tools.tf` + `modules/tool/` | ツールごとの D1（本番 / staging）、Worker の枠、Custom Domain、staging の Access                       |
| `zone.tf`                    | version affinity の Transform Rule、WAF（Free Managed Ruleset + custom rule）、rate limiting、TLS 設定 |
| `redirects.tf`               | 旧ホスト（`qrcc.riml4i.com` など）の 301                                                               |
| `portal.tf`                  | ポータル Worker（`tools.riml4i.com`）                                                                  |
| `tokens.tf`                  | CI 用 Cloudflare API トークン（production / staging）                                                  |
| `github.tf`                  | リポジトリ設定、rulesets、environments、Actions の secret / variable                                   |
| `imports.tf`                 | 既存リソースの取り込み（名前 → ID を data source で引く）                                              |
| `terraform.tfvars`           | 秘密でない切り替え（staging ドメイン、ポータル、旧ホストの扱い）                                       |

コードの版（`wrangler versions upload`）と配信割合（`wrangler versions deploy`）は wrangler が持つ。
Terraform は Worker の「枠」だけを作り、observability・workers.dev・preview URL の差分は無視する（wrangler.jsonc が正本）。

## ブートストラップ（1 回だけ、人の手で）

人がトークンの値を扱うのはここだけ。以後の CI 用トークンは Terraform が発行して GitHub に書き込む。

### 1. HCP Terraform

1. <https://app.terraform.io> で organization を作る（名前は自由。以下 `<org>`）
2. workspace `rimltools-production` を **CLI-driven workflow** で作る
3. workspace の Settings → General → **Execution Mode を `Local`** にする
   （runner で実行し state だけを HCP に置く。Remote にすると Cloudflare / GitHub のトークンを HCP にも置くことになる）
4. User Settings → Tokens で **team か user の API トークン**を作る（以下 `TF_API_TOKEN`）

### 2. Terraform 用 Cloudflare API トークン

Cloudflare ダッシュボード → My Profile → API Tokens → Create Custom Token。対象はこのアカウントと `riml4i.com` ゾーンだけ。

| 範囲               | 権限                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account            | Workers Scripts: Edit / D1: Edit / Account API Tokens: Edit / Access: Apps and Policies: Edit / Account Settings: Read                                                  |
| Zone（riml4i.com） | Zone: Read / DNS: Edit / Workers Routes: Edit / Transform Rules: Edit / Zone WAF: Edit / Dynamic URL Redirects: Edit / Zone Settings: Edit / SSL and Certificates: Edit |

> Cloudflare Access（staging の保護）を使う場合は、先に Zero Trust の組織を一度作っておく
> （ダッシュボード → Zero Trust。Free プラン、50 ユーザーまで無料）。

### 3. GitHub fine-grained PAT

<https://github.com/settings/personal-access-tokens/new> で、対象を `RimlTempest/rimltools` だけにする。

| Repository permissions | 権限                                       |
| ---------------------- | ------------------------------------------ |
| Administration         | Read and write（リポジトリ設定・rulesets） |
| Environments           | Read and write                             |
| Secrets                | Read and write                             |
| Variables              | Read and write                             |
| Metadata               | Read-only（必須）                          |

### 4. GitHub に登録する

`!` シェルは非対話なので、値はクリップボード経由で渡す。値をクリップボードにコピーした直後に 1 行ずつ実行する。

```bash
pbpaste | gh secret set TF_API_TOKEN -R RimlTempest/rimltools
pbpaste | gh secret set TF_VAR_cloudflare_api_token -R RimlTempest/rimltools
pbpaste | gh secret set TF_VAR_github_token -R RimlTempest/rimltools
gh variable set TF_CLOUD_ORGANIZATION -R RimlTempest/rimltools --body '<org>'
gh variable set CLOUDFLARE_ACCOUNT_ID -R RimlTempest/rimltools --body '<account id>'
# staging を Cloudflare Access で保護する場合（JSON の配列）
gh variable set TF_VAR_ACCESS_EMAILS -R RimlTempest/rimltools --body '["you@example.com"]'
```

登録したら `gh secret list -R RimlTempest/rimltools` で 3 件が見えること（値が空で登録されていないか、更新日時で確認）。

### 5. 初回 plan を確認する

`infra/terraform/**` を触る PR を出す（または Actions → Terraform → Run workflow）。PR に plan がコメントされる。
**apply する前に、次を必ず確認する。**

- [ ] `import` が期待どおり: Worker 4 つ（qrcc-web / qrcc-api / noter-web / noter-sync）、D1 2 つ（qrcc / noter）、
      Custom Domain 2 つ（qrcc.riml4i.com / noter.riml4i.com）、GitHub のリポジトリ・ruleset 2 つ・`production` environment
- [ ] 取り込んだリソースに **`must be replaced` / `destroy` が無い**（本番の D1 と Worker には `prevent_destroy` がある）
- [ ] 取り込んだ zone ruleset（ダッシュボードで作ったルールがあれば）で、消えるルールが無いか
- [ ] 新規作成が期待どおり: staging の D1・Worker、`<tool>.tools.riml4i.com` の Custom Domain、CI トークン 2 本、
      environments（staging / preview）と secret / variable
- [ ] ruleset の required checks: develop = `gate`, `security-gate`, `conventional` / main = 左記 + `release-guard`
      （**これらのチェックを出すワークフローがまだ無いと、PR がマージできなくなる**。先にワークフローが develop に入っていること）

問題なければ Release PR（develop → main）をマージすると、main への push で apply される。
手元で確認したいときは:

```bash
cd infra/terraform
export TF_CLOUD_ORGANIZATION='<org>' TF_TOKEN_app_terraform_io='...' \
  TF_VAR_cloudflare_api_token='...' TF_VAR_github_token='...' TF_VAR_cloudflare_account_id='...'
terraform init && terraform plan
```

## ドメイン移行（`<tool>.riml4i.com` → `<tool>.tools.riml4i.com`）

1 段ずつ PR（`terraform.tfvars` の変更）→ Release PR → apply で進める。

1. **新ドメインを足す**（初回 apply で自動）: `qrcc.tools.riml4i.com` / `noter.tools.riml4i.com` が本番 Worker に付く。旧ドメインもそのまま動く
2. **OAuth のリダイレクト URI を足す**（手作業）: Google Cloud Console の OAuth クライアントに
   `https://<tool>.tools.riml4i.com/api/auth/callback/google`（staging を使うなら `-staging` も）を**追加**する。旧 URI はまだ消さない
3. **アプリの BASE URL を新ドメインにする**（C レーン: 各プロダクトの wrangler.jsonc / 環境変数）→ リリース
4. **旧ホストを外す**: `legacy_hosts_mode = "detached"`。旧 URL は一時的に解決しなくなるので、4 と 5 は続けて行う
5. **301 にする**: `legacy_hosts_mode = "redirect"`（proxied の DNS レコード + Single Redirect Rule、パスとクエリを保持）
6. 数週間後、Google の旧リダイレクト URI を消す

> 4 と 5 を 1 回の apply で行うと失敗する。Custom Domain が作った DNS レコードが残っているうちに、
> 同じ名前のレコードを作ろうとするため。

## 切り替えの一覧（`terraform.tfvars`）

| 変数                            | 既定       | いつ変えるか                                                                       |
| ------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `staging_domains_enabled`       | `false`    | staging への初回デプロイの後（Custom Domain はコードのある Worker にしか付かない） |
| `portal_domain_enabled`         | `false`    | ポータルの初回デプロイの後                                                         |
| `legacy_hosts_mode`             | `attached` | ドメイン移行の 4・5                                                                |
| `manage_zone_security_settings` | `true`     | ゾーン内に HTTP しか話せないホストがある場合だけ `false`                           |

## 制約・既知の限界

- CI 用トークン（`cloudflare_account_token`）の対象はアカウント単位までしか絞れない。production / staging で分けているのは、漏洩時に片方だけ失効させるため
- `ci_token_permission_groups` の名前は、権限グループ API が返す名前（ダッシュボードの表示名と異なることがある）。
  見つからない名前があると `check` が失敗を報告するので、`variables.tf` の既定値を直す
- Free プランの rate limiting は 1 本・式は path のみ・IP 単位・10 秒。host で絞れないため、ゾーン全体の `/api/auth/` に効く
- zone の entry point ruleset は phase ごとに 1 つ。既存のものは取り込まれ、ルールはこの定義で置き換わる
- GitHub の variable は空値を持てないため、production の `WORKER_SUFFIX` は作らない（workflow では空文字として展開される）
