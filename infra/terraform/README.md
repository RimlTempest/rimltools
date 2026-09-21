# infra/terraform

Cloudflare と GitHub のリソースを Terraform で管理する（ADR-0005）。
state は HCP Terraform Free に置き、plan / apply は GitHub Actions（`.github/workflows/terraform.yml`）の runner で行う。

| ファイル                     | 中身                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tools.tf` + `modules/tool/` | ツールごとの D1（本番 / staging）、Worker の枠、Custom Domain、staging の Access。ポータル（`apex: true`）も同じモジュール |
| `zone.tf`                    | version affinity の Transform Rule、WAF（Free Managed Ruleset + custom rule）、rate limiting、TLS 設定                     |
| `redirects.tf`               | 旧ホスト（`qrcc.riml4i.com` など）の 301                                                                                   |
| `ops.tf`                     | ops（SLO・synthetic・無料枠の監視）用の environment、Analytics 専用トークン、repo variable                                 |
| `tokens.tf`                  | CI 用 Cloudflare API トークン（production / staging）                                                                      |
| `github.tf`                  | リポジトリ設定、rulesets、environments、Actions の secret / variable                                                       |
| `imports.tf`                 | 既存リソースの取り込み（名前 → ID を data source で引く）                                                                  |
| `terraform.tfvars`           | 秘密でない切り替え（staging ドメイン、ポータル、旧ホストの扱い）                                                           |

コードの版（`wrangler versions upload`）と配信割合（`wrangler versions deploy`）は wrangler が持つ。
Terraform は Worker の「枠」だけを作り、observability・workers.dev・preview URL の差分は無視する（wrangler.jsonc が正本）。

## ブートストラップ（1 回だけ、人の手で）

人がトークンの値を扱うのはここだけ。以後の CI 用デプロイトークンは Terraform が発行して GitHub に書き込む。

資格情報は **plan 用（読み取り専用）と apply 用（書き込み）の 2 本立て**にする。

|                | plan（PR）                                  | apply（main への push）                                     |
| -------------- | ------------------------------------------- | ----------------------------------------------------------- |
| 実行するコード | レビュー前の PR のコード                    | main にマージ済みのコード                                   |
| 置き場所       | repository secret                           | `production` environment の secret（main からしか読めない） |
| HCP            | `TF_PLAN_API_TOKEN`                         | `TF_APPLY_API_TOKEN`                                        |
| Cloudflare     | `TF_PLAN_CLOUDFLARE_API_TOKEN`（Read のみ） | `TF_APPLY_CLOUDFLARE_API_TOKEN`（Edit）                     |
| GitHub         | `TF_PLAN_GITHUB_TOKEN`（Read のみ）         | `TF_APPLY_GITHUB_TOKEN`（Read and write）                   |

PR のコードは data source や provider 経由で環境変数を外へ送れる。plan に書き込みトークンを渡すと、
PR を出せる人がマージ前に本番を書き換えられてしまうため、plan には読み取り専用しか渡さない。

### 1. HCP Terraform

1. <https://app.terraform.io> で organization を作る（名前は自由。以下 `<org>`）
2. workspace `rimltools-production` を **CLI-driven workflow** で作る
3. workspace の Settings → General → **Execution Mode を `Local`** にする
   （runner で実行し state だけを HCP に置く。Remote にすると Cloudflare / GitHub のトークンを HCP にも置くことになる）
4. API トークンを 2 本作る
   - apply 用（`TF_APPLY_API_TOKEN`）: state の読み書きができるトークン
   - plan 用（`TF_PLAN_API_TOKEN`）: 可能なら **state の読み取りだけ**の team を作り、その team token にする。
     プランの都合でできない場合は別のトークンを発行し、漏洩時にそれだけ失効できるようにする（下の「既知の制約」）

### 2. Cloudflare API トークン（2 本）

Cloudflare ダッシュボード → My Profile → API Tokens → Create Custom Token。どちらも対象はこのアカウントと `riml4i.com` ゾーンだけ。
権限名は provider の docs（各リソースの "Accepted Permissions"）に合わせている。

**apply 用 `TF_APPLY_CLOUDFLARE_API_TOKEN`**

| 範囲               | 権限                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account            | Workers Scripts: Edit / D1: Edit / Account API Tokens: Edit / Access: Apps and Policies: Edit / Account Settings: Read                                                  |
| Zone（riml4i.com） | Zone: Read / DNS: Edit / Workers Routes: Edit / Transform Rules: Edit / Zone WAF: Edit / Dynamic URL Redirects: Edit / Zone Settings: Edit / SSL and Certificates: Edit |

**plan 用 `TF_PLAN_CLOUDFLARE_API_TOKEN`**（すべて Read）

| 範囲               | 権限                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account            | Workers Scripts: Read / D1: Read / Account API Tokens: Read / Access: Apps and Policies: Read / Account Settings: Read                                                  |
| Zone（riml4i.com） | Zone: Read / DNS: Read / Workers Routes: Read / Transform Rules: Read / Zone WAF: Read / Dynamic URL Redirects: Read / Zone Settings: Read / SSL and Certificates: Read |

> Cloudflare Access（staging の保護）を使う場合は、先に Zero Trust の組織を一度作っておく
> （ダッシュボード → Zero Trust。Free プラン、50 ユーザーまで無料）。

### 3. GitHub fine-grained PAT（2 本）

<https://github.com/settings/personal-access-tokens/new> で、どちらも対象を `RimlTempest/rimltools` だけにする。

| Repository permissions                                      | apply 用 `TF_APPLY_GITHUB_TOKEN` | plan 用 `TF_PLAN_GITHUB_TOKEN` |
| ----------------------------------------------------------- | -------------------------------- | ------------------------------ |
| Administration（リポジトリ設定・rulesets・Dependabot 設定） | Read and write                   | Read-only                      |
| Environments（environment と その secret / variable）       | Read and write                   | Read-only                      |
| Secrets                                                     | Read and write                   | Read-only                      |
| Variables                                                   | Read and write                   | Read-only                      |
| Metadata                                                    | Read-only（必須）                | Read-only（必須）              |

### 4. GitHub に登録する

`!` シェルは非対話なので、値はクリップボード経由で渡す。値をクリップボードにコピーした直後に 1 行ずつ実行する。

**plan 用（repository secret）**

```bash
pbpaste | gh secret set TF_PLAN_API_TOKEN -R RimlTempest/rimltools
pbpaste | gh secret set TF_PLAN_CLOUDFLARE_API_TOKEN -R RimlTempest/rimltools
pbpaste | gh secret set TF_PLAN_GITHUB_TOKEN -R RimlTempest/rimltools
```

**apply 用（`production` environment の secret）**

`production` environment は既にある。Terraform が管理するのは `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`（CI のデプロイ用）だけで、
`TF_APPLY_*` は Terraform の管理外。apply のための資格情報を apply 自身が作る鶏と卵を避けるため、**最初の 1 回は手で登録する**。

```bash
pbpaste | gh secret set TF_APPLY_API_TOKEN -R RimlTempest/rimltools -e production
pbpaste | gh secret set TF_APPLY_CLOUDFLARE_API_TOKEN -R RimlTempest/rimltools -e production
pbpaste | gh secret set TF_APPLY_GITHUB_TOKEN -R RimlTempest/rimltools -e production
```

> 初回 apply までは `production` environment にブランチ制限が無い（Terraform が main のみに絞る）。
> それまでに `environment: production` を使うワークフローを main 以外で動かさないこと。
> 手で先に絞ってもよい: Settings → Environments → production → Deployment branches → Selected branches → `main`。

**共通（repository variable、秘密ではない）**

```bash
gh variable set TF_CLOUD_ORGANIZATION -R RimlTempest/rimltools --body '<org>'
gh variable set CLOUDFLARE_ACCOUNT_ID -R RimlTempest/rimltools --body '<account id>'
# staging を Cloudflare Access で保護する場合（JSON の配列）
gh variable set TF_VAR_ACCESS_EMAILS -R RimlTempest/rimltools --body '["you@example.com"]'
```

登録後、`gh secret list -R RimlTempest/rimltools` で 3 件、`gh secret list -R RimlTempest/rimltools -e production` で 3 件が見えること
（値が空で登録されていないか、更新日時で確認）。

**旧名の secret が残っていたら消す**（書き込みトークンが repository secret に残らないように）:

```bash
gh secret delete TF_API_TOKEN -R RimlTempest/rimltools
gh secret delete TF_VAR_cloudflare_api_token -R RimlTempest/rimltools
gh secret delete TF_VAR_github_token -R RimlTempest/rimltools
```

### 5. 初回 plan を確認する

`infra/terraform/**` を触る PR を出す（または Actions → Terraform → Run workflow）。PR に plan がコメントされる。
**apply する前に、次を必ず確認する。**

- [ ] `import` が期待どおり: Worker 4 つ（qrcc-web / qrcc-api / noter-web / noter-sync）、D1 2 つ（qrcc / noter）、
      Custom Domain 2 つ（qrcc.riml4i.com / noter.riml4i.com）、GitHub のリポジトリ・ruleset 2 つ・`production` environment
- [ ] 取り込んだリソースに **`must be replaced` / `destroy` が無い**（本番の D1 と Worker には `prevent_destroy` がある）
- [ ] 取り込んだ zone ruleset（ダッシュボードで作ったルールがあれば）で、消えるルールが無いか
- [ ] 新規作成が期待どおり: staging の D1・Worker、`<tool>.tools.riml4i.com` の Custom Domain、CI トークン 2 本、
      environments（staging / preview）と secret / variable、ポータルの Worker 枠（`rimltools-portal` / `-staging`）
- [ ] ops: environment `ops`（develop のみ）、Analytics Read だけのトークン → secret `CLOUDFLARE_ANALYTICS_TOKEN` /
      `CLOUDFLARE_ACCOUNT_ID`、repo variable `OPS_HOST_OVERRIDES` / `OPS_ISSUES`。**これらは手で登録しない**（Terraform が作る）
- [ ] ruleset の required checks: develop = `gate`, `security-gate`, `conventional` / main = 左記 + `release-guard`
      （**これらのチェックを出すワークフローがまだ無いと、PR がマージできなくなる**。先にワークフローが develop に入っていること）
- [ ] plan が権限不足（403）で落ちていない。落ちたら plan 用トークンに足りない Read 権限を足す（Edit は足さない）

問題なければ Release PR（develop → main）をマージすると、main への push で apply される。
手元で確認したいときは:

```bash
cd infra/terraform
# plan 用（読み取り専用）の値を使う
export TF_CLOUD_ORGANIZATION='<org>' TF_TOKEN_app_terraform_io='...' \
  TF_VAR_cloudflare_api_token='...' TF_VAR_github_token='...' TF_VAR_cloudflare_account_id='...'
terraform init && terraform plan -lock=false
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

| 変数                            | 既定         | いつ変えるか                                                                           |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `staging_domains_enabled`       | `false`      | staging への初回デプロイの後（Custom Domain はコードのある Worker にしか付かない）     |
| `pending_tools`                 | `["portal"]` | 初回の本番デプロイの後にそのツール名を消す（本番ドメインが付き、ops の監視対象になる） |
| `legacy_hosts_mode`             | `attached`   | ドメイン移行の 4・5                                                                    |
| `ops_issues_enabled`            | `false`      | ops ワークフローに Issue の起票を許すとき（repo variable `OPS_ISSUES`）                |
| `manage_zone_security_settings` | `true`       | ゾーン内に HTTP しか話せないホストがある場合だけ `false`                               |

## 制約・既知の限界

- CI 用トークン（`cloudflare_account_token`）の対象はアカウント単位までしか絞れない。production / staging で分けているのは、漏洩時に片方だけ失効させるため
- `ci_token_permission_groups` の名前は、権限グループ API が返す名前（ダッシュボードの表示名と異なることがある）。
  見つからない名前があると `check` が失敗を報告するので、`variables.tf` の既定値を直す
- Free プランの rate limiting は 1 本・式は path のみ・IP 単位・10 秒。host で絞れないため、ゾーン全体の `/api/auth/` に効く
- zone の entry point ruleset は phase ごとに 1 つ。既存のものは取り込まれ、ルールはこの定義で置き換わる
- GitHub の variable は空値を持てないため、production の `WORKER_SUFFIX` は作らない（workflow では空文字として展開される）
- `OPS_HOST_OVERRIDES` は `legacy_hosts_mode` と `pending_tools` から作る。移行中（`attached`）は旧ホストを監視し、
  未デプロイのツールは `""`（監視しない）。移行後は空で、tools.json の既定ホストが使われる
- ツールごとの D1 は 0 か 1 個（`D1_<TOOL>_ID`）。D1 を持たないツール（ポータル）は変数を作らない

## 読み取り専用トークンでの plan の既知の制約

provider の docs（各リソースの "Accepted Permissions"）では、ここで使うリソースと data source はすべて Read 権限で読める。
ただし次の点は plan 用トークンでは見えない、または確認できていない。

- **secret の値**: `github_actions_environment_secret` は GitHub API が値を返さないので、値の差分は plan に出ない
  （更新日時の変化だけを検出する）。CI トークンを作り直したときの反映は apply で確認する
- **CI トークンの値**: `cloudflare_account_token` の値は発行時にしか返らない。Read で見えるのはポリシーと状態だけ
- **Access**: `cloudflare_zero_trust_access_application` は docs に Accepted Permissions の記載が無い。
  policy と同じ `Access: Apps and Policies: Read` で読める想定。403 になったら plan 用トークンに Read を足す
- **zone ruleset**: `cloudflare_ruleset` も記載が無い。phase ごとの Read 権限（Transform Rules / Zone WAF / Dynamic URL Redirects）で読める想定
- **HCP の state**: plan は state を読むので、plan 用 HCP トークンでも state 内の値（CI トークンの値を含む）は読める。
  state の読み取りを外すと plan できないため、ここは権限では防げない。対策は次の 2 点:
  - fork からの PR には GitHub が secret を渡さない（public リポジトリの既定）。secret を使えるのは push 権限のある人のブランチだけ
  - 漏洩が疑われたら `cloudflare_account_token.ci` を `terraform apply -replace` で作り直す（GitHub の secret も同時に更新される）
- plan は `-lock=false` で実行する（state のロックという書き込みを避ける。apply はロックする）
