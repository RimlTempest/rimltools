# infra/terraform

Cloudflare と GitHub のリソースを OpenTofu（`tofu`）で管理する（ADR-0005 / ADR-0009）。
state は自前の http backend（`infra/tfstate` の Worker、D1 に保存）に置き、OpenTofu が**送る前に暗号化**する。
plan / apply は GitHub Actions（`.github/workflows/terraform.yml`）の runner で行い、資格情報は SOPS で
暗号化した `infra/secrets/*.sops.yaml` から渡す。

| ファイル                     | 中身                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tools.tf` + `modules/tool/` | ツールごとの D1、Worker の枠、Custom Domain。ポータル（`apex: true`）も同じモジュール                  |
| `zone.tf`                    | version affinity の Transform Rule、WAF（Free Managed Ruleset + custom rule）、rate limiting、TLS 設定 |
| `redirects.tf`               | 旧ホスト（`qrcc.riml4i.com` など）の 301                                                               |
| `ops.tf`                     | ops（SLO・synthetic・無料枠の監視）用の environment、Analytics 専用トークン、repo variable             |
| `tokens.tf`                  | CI 用 Cloudflare API トークン（production）                                                            |
| `github.tf`                  | リポジトリ設定、rulesets、environments、Actions の secret / variable                                   |
| `imports.tf`                 | 既存リソースの取り込み（名前 → ID を data source で引く）                                              |
| `terraform.tfvars`           | 秘密でない切り替え（ポータル、旧ホストの扱い）                                                         |

コードの版（`wrangler versions upload`）と配信割合（`wrangler versions deploy`）は wrangler が持つ。
Terraform は Worker の「枠」だけを作り、observability・workers.dev・preview URL の差分は無視する（wrangler.jsonc が正本）。

## ブートストラップ（1 回だけ、人の手で）

**GitHub に登録する secret は age の秘密鍵 2 本だけ**。それ以外の資格情報（state backend・Cloudflare・GitHub・
Grafana のトークン、state の暗号化パスフレーズ）は、SOPS で暗号化してリポジトリに置く。

| ファイル                        | 中身                   | 開ける鍵           | 鍵の置き場所                                                      |
| ------------------------------- | ---------------------- | ------------------ | ----------------------------------------------------------------- |
| `infra/secrets/plan.sops.yaml`  | 読み取り専用の資格情報 | plan 鍵 / apply 鍵 | plan 鍵: repository secret `SOPS_AGE_KEY_PLAN`                    |
| `infra/secrets/apply.sops.yaml` | 書き込み用の資格情報   | apply 鍵だけ       | apply 鍵: `production` environment の secret `SOPS_AGE_KEY_APPLY` |

PR の plan はレビュー前のコードを実行する。plan 鍵で開けるのは読み取り専用の資格情報だけなので、PR の
コードが環境変数を外へ送っても、本番は書き換えられない。apply 鍵は main からの apply だけが読める。

手順の全体は `docs/bootstrap.md`。ここでは infra/terraform に関わる部分と、権限の一覧を置く。

### 1. age 鍵を 2 本作る

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/rimltools-plan.txt
age-keygen -o ~/.config/sops/age/rimltools-apply.txt
```

- 出力された公開鍵（`age1...`）を、リポジトリ直下の `.sops.yaml` の placeholder と置き換える
- **秘密鍵（`AGE-SECRET-KEY-...`）はパスワードマネージャーにも控える（必須）**。失うと secrets ファイルを開けなくなる
- 秘密鍵はリポジトリに置かない（`infra/secrets` の検査と gitleaks が止めるが、そもそもコピーしない）

### 2. state backend を用意する

`infra/tfstate/README.md` の手順で Worker `rimltools-tfstate` と D1 を作り、読み取り用・書き込み用の資格情報を
Worker の secret に入れる。state の暗号化パスフレーズも作る（`openssl rand -base64 48`、**パスワードマネージャーに控える。
失うと state を読めなくなる**）。

### 3. トークンを作る

Cloudflare ダッシュボード → My Profile → API Tokens → Create Custom Token。どちらも対象はこのアカウントと `riml4i.com` ゾーンだけ。
権限名は provider の docs（各リソースの "Accepted Permissions"）に合わせている。

**apply 用**（`apply.sops.yaml` の `TF_VAR_cloudflare_api_token`）

| 範囲               | 権限                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account            | Workers Scripts: Edit / D1: Edit / Account API Tokens: Edit / Access: Apps and Policies: Edit / Account Settings: Read                                                  |
| Zone（riml4i.com） | Zone: Read / DNS: Edit / Workers Routes: Edit / Transform Rules: Edit / Zone WAF: Edit / Dynamic URL Redirects: Edit / Zone Settings: Edit / SSL and Certificates: Edit |

**plan 用**（`plan.sops.yaml` の `TF_VAR_cloudflare_api_token`、すべて Read）

| 範囲               | 権限                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account            | Workers Scripts: Read / D1: Read / Account API Tokens: Read / Access: Apps and Policies: Read / Account Settings: Read                                                  |
| Zone（riml4i.com） | Zone: Read / DNS: Read / Workers Routes: Read / Transform Rules: Read / Zone WAF: Read / Dynamic URL Redirects: Read / Zone Settings: Read / SSL and Certificates: Read |

> （ダッシュボード → Zero Trust。Free プラン、50 ユーザーまで無料）。

GitHub の fine-grained PAT は <https://github.com/settings/personal-access-tokens/new> で、どちらも対象を `RimlTempest/rimltools` だけにする。

| Repository permissions                                      | apply 用（`apply.sops.yaml`） | plan 用（`plan.sops.yaml`） |
| ----------------------------------------------------------- | ----------------------------- | --------------------------- |
| Administration（リポジトリ設定・rulesets・Dependabot 設定） | Read and write                | Read-only                   |
| Environments（environment と その secret / variable）       | Read and write                | Read-only                   |
| Secrets                                                     | Read and write                | Read-only                   |
| Variables                                                   | Read and write                | Read-only                   |
| Metadata                                                    | Read-only（必須）             | Read-only（必須）           |

Grafana Cloud のトークンは `infra/grafana/README.md` §1。

### 4. secrets ファイルを作って暗号化する

```bash
cp infra/secrets/plan.example.yaml  infra/secrets/plan.sops.yaml
cp infra/secrets/apply.example.yaml infra/secrets/apply.sops.yaml
# 値を入れる（エディタで開いたらすぐ暗号化する。平文のままコミットしようとすると pre-commit が止める）
sops encrypt -i infra/secrets/plan.sops.yaml
sops encrypt -i infra/secrets/apply.sops.yaml
# 以後の編集は sops で開く（保存時に暗号化される）
sops infra/secrets/apply.sops.yaml
```

`bun scripts/check-secrets.ts` が通ること（CI の security-gate と lefthook も同じ検査をする）。暗号化したファイルは PR でコミットする。

### 5. GitHub に登録する

値をクリップボードにコピーした直後に 1 行ずつ実行する（`!` シェルは非対話なので `pbpaste` で渡す）。

```bash
# plan 鍵（repository secret）
pbpaste | gh secret set SOPS_AGE_KEY_PLAN -R RimlTempest/rimltools
# apply 鍵（production environment の secret。main からしか読めない）
pbpaste | gh secret set SOPS_AGE_KEY_APPLY -R RimlTempest/rimltools -e production

# 秘密ではない値（repository variable）
gh variable set CLOUDFLARE_ACCOUNT_ID -R RimlTempest/rimltools --body '<account id>'
gh variable set TF_VAR_ACCESS_EMAILS -R RimlTempest/rimltools --body '["<あなたのメールアドレス>"]'
```

> 初回 apply までは `production` environment にブランチ制限が無い（Terraform が main のみに絞る）。
> 先に手で絞っておく: Settings → Environments → production → Deployment branches → Selected branches → `main`。

旧方式（HCP Terraform）の secret が残っていたら消す: `TF_PLAN_*` / `TF_APPLY_*` / `TF_API_TOKEN` / `TF_VAR_*`（repository と production の両方）。

### 6. 初回 plan を確認する

`infra/terraform/**` を触る PR を出す（または Actions → Terraform → Run workflow）。PR に plan がコメントされる。
**apply する前に、次を必ず確認する。**

- [ ] `import` が期待どおり: Worker 4 つ（qrcc-web / qrcc-api / noter-web / noter-sync）、D1 2 つ（qrcc / noter）、
      Custom Domain 2 つ（qrcc.riml4i.com / noter.riml4i.com）、GitHub のリポジトリ・ruleset 2 つ・`production` environment
- [ ] 取り込んだリソースに **`must be replaced` / `destroy` が無い**（本番の D1 と Worker には `prevent_destroy` がある）
- [ ] 取り込んだ zone ruleset（ダッシュボードで作ったルールがあれば）で、消えるルールが無いか
- [ ] 新規作成が期待どおり: `<tool>.tools.riml4i.com` の Custom Domain、CI トークン、
      environment（production）と secret / variable、ポータルの Worker 枠（`rimltools-portal`）
- [ ] ops: environment `ops`（develop のみ）、Analytics Read だけのトークン → secret `CLOUDFLARE_ANALYTICS_TOKEN` /
      `CLOUDFLARE_ACCOUNT_ID`、repo variable `OPS_HOST_OVERRIDES` / `OPS_ISSUES`。**これらは手で登録しない**（Terraform が作る）
- [ ] ruleset の required checks: develop = `gate`, `security-gate`, `conventional` / main = 左記 + `release-guard`
      （**これらのチェックを出すワークフローがまだ無いと、PR がマージできなくなる**。先にワークフローが develop に入っていること）
- [ ] plan が権限不足（403）で落ちていない。落ちたら plan 用トークンに足りない Read 権限を足す（Edit は足さない）

問題なければ Release PR（develop → main）をマージすると、main への push で apply される。
手元で確認したいときは:

```bash
cd infra/terraform
# plan 鍵（読み取り専用）で plan.sops.yaml を開き、tofu にだけ渡す
export SOPS_AGE_KEY_FILE=~/.config/sops/age/rimltools-plan.txt TF_VAR_cloudflare_account_id='...'
sops exec-env ../secrets/plan.sops.yaml 'tofu init && tofu plan -lock=false'
```

## ドメイン移行（`<tool>.riml4i.com` → `<tool>.tools.riml4i.com`）

1 段ずつ PR（`terraform.tfvars` の変更）→ Release PR → apply で進める。

1. **新ドメインを足す**（初回 apply で自動）: `qrcc.tools.riml4i.com` / `noter.tools.riml4i.com` が本番 Worker に付く。旧ドメインもそのまま動く
2. **OAuth のリダイレクト URI を足す**（手作業）: Google Cloud Console の OAuth クライアントに
   `https://<tool>.tools.riml4i.com/api/auth/callback/google` を**追加**する。旧 URI はまだ消さない
3. **アプリの BASE URL を新ドメインにする**（C レーン: 各プロダクトの wrangler.jsonc / 環境変数）→ リリース
4. **旧ホストを外す**: `legacy_hosts_mode = "detached"`。旧 URL は一時的に解決しなくなるので、4 と 5 は続けて行う
5. **301 にする**: `legacy_hosts_mode = "redirect"`（proxied の DNS レコード + Single Redirect Rule、パスとクエリを保持）
6. 数週間後、Google の旧リダイレクト URI を消す

> 4 と 5 を 1 回の apply で行うと失敗する。Custom Domain が作った DNS レコードが残っているうちに、
> 同じ名前のレコードを作ろうとするため。

## 切り替えの一覧（`terraform.tfvars`）

| 変数                            | 既定         | いつ変えるか                                                                           |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `pending_tools`                 | `["portal"]` | 初回の本番デプロイの後にそのツール名を消す（本番ドメインが付き、ops の監視対象になる） |
| `legacy_hosts_mode`             | `attached`   | ドメイン移行の 4・5                                                                    |
| `ops_issues_enabled`            | `false`      | ops ワークフローに Issue の起票を許すとき（repo variable `OPS_ISSUES`）                |
| `manage_zone_security_settings` | `true`       | ゾーン内に HTTP しか話せないホストがある場合だけ `false`                               |

## 制約・既知の限界

- PR の plan には Google OAuth の JSON を渡さないので、`APP_SECRETS` は plan のたびに
  「変更あり」（sensitive）と表示される。apply では正しい値が入る

- CI 用トークン（`cloudflare_account_token`）の account 権限はアカウント単位までしか絞れない。
  zone 権限（`ci_token_zone_permission_groups`、既定は `Workers Routes Read`）は別のポリシーにして、ツールのゾーンだけに絞っている
- `Workers Observability Write` を CI トークンに付けている。段階リリースの判定が使う Observability API は、読み取りでも Write を要求するため
- `ci_token_permission_groups` / `ci_token_zone_permission_groups` の名前は、権限グループ API が返す名前（ダッシュボードの表示名と異なることがある）。
  見つからない名前があると `check` が失敗を報告するので、`variables.tf` の既定値を直す
- ruleset（develop / main）は required checks に加えて、CodeQL の結果を必須にしている（`required_code_scanning`:
  security alert が high 以上、または alert が error のときマージ不可）。API で先行適用した設定と同じ
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
- **state の中身**: state は OpenTofu が暗号化してから backend に送るので、Worker と D1 は暗号文しか持たない。
  plan は state を復号して読むので、plan 鍵で開ける `plan.sops.yaml` にも暗号化パスフレーズが入っている。
  つまり plan 鍵が漏れると state 内の値（CI トークンの値を含む）は読める。ここは構造上の限界で、対策は次の 2 点:
  - fork からの PR には GitHub が secret を渡さない（public リポジトリの既定）。plan 鍵を使えるのは push 権限のある人のブランチだけ
  - 漏洩が疑われたら `docs/runbooks/secret-leak.md` の手順で、鍵・パスフレーズ・state 内のトークンを作り直す
- plan は `-lock=false` で実行する（state のロックという書き込みを避ける。apply はロックする）
