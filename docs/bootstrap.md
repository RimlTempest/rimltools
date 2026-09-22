# 本番の立ち上げ手順（ブートストラップ）

リポジトリを統合してから本番デプロイを再開するまでに、**人の手で 1 回だけ行う作業**をまとめた手順書。
細かい理由や権限の一覧は、各節からリンクしている README にある。

- 所要時間の目安: 1〜2 時間（DNS と証明書の反映待ちを除く）
- 順番どおりに進める。各段の「確認」が通るまで次へ進まない
- `!` で実行するシェルは非対話なので、トークンの値はクリップボードに入れてから `pbpaste | gh secret set ...` で渡す

## 全体の流れ

| 段  | やること                                    | どこで                                                |
| --- | ------------------------------------------- | ----------------------------------------------------- |
| 1   | アカウントと workspace を用意する           | HCP Terraform / Grafana Cloud / Cloudflare Zero Trust |
| 2   | トークンを作る（plan 用・apply 用を分ける） | HCP / Cloudflare / GitHub / Grafana                   |
| 3   | GitHub に secret と variable を登録する     | 端末                                                  |
| 4   | 初回 plan を確認する                        | PR のコメント                                         |
| 5   | 初回 apply（staging だけ有効）              | Release PR をマージ                                   |
| 6   | staging にデプロイして確かめる              | develop への push                                     |
| 7   | production を有効にする                     | PR → Release PR                                       |
| 8   | 最初の本番リリース（段階リリース）          | Release PR                                            |
| 9   | ドメインを `<tool>.tools.riml4i.com` へ移す | PR を数回                                             |
| 10  | 監視を仕上げる                              | Grafana / PR                                          |
| 11  | 後片付け                                    | GitHub / 端末                                         |

## 1. アカウントと workspace

1. **HCP Terraform**（<https://app.terraform.io>、Free）
   - organization を作る（以下 `<org>`）
   - workspace を 2 つ、**CLI-driven workflow** で作る: `rimltools-production`（Cloudflare・GitHub）と `rimltools-observability`（Grafana）
   - どちらも Settings → General → **Execution Mode を `Local`** にする（トークンを HCP に置かないため）
2. **Grafana Cloud**（Free、カード不要）
   - サインアップ時にできるスタックの slug を `rimltools` にする（違う名前にしたら `infra/grafana/terraform.tfvars` の `stack_slug` を直す）
3. **Cloudflare Zero Trust**
   - ダッシュボード → Zero Trust で組織を一度作る（Free、50 ユーザーまで）。staging を本人だけに閉じるのに使う
4. **Google Cloud Console**（既存の OAuth クライアント）
   - 承認済みのリダイレクト URI に、次を**追加**する（既存の URI は消さない）
     - `https://qrcc.tools.riml4i.com/api/auth/callback/google`
     - `https://noter.tools.riml4i.com/api/auth/callback/google`
     - `https://qrcc-staging.tools.riml4i.com/api/auth/callback/google`
     - `https://noter-staging.tools.riml4i.com/api/auth/callback/google`

## 2. トークンを作る

どれも **plan 用（読み取り専用）と apply 用（書き込み）の 2 本**を作る。
PR のコードが動く plan に書き込み権限を渡さないため（`infra/terraform/README.md` のブートストラップ節）。

| サービス                                          | plan 用                                     | apply 用                                  | 権限の一覧                                                |
| ------------------------------------------------- | ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| HCP Terraform                                     | `TF_PLAN_API_TOKEN`                         | `TF_APPLY_API_TOKEN`                      | `infra/terraform/README.md` §1。両 workspace に触れること |
| Cloudflare                                        | `TF_PLAN_CLOUDFLARE_API_TOKEN`（Read のみ） | `TF_APPLY_CLOUDFLARE_API_TOKEN`（Edit）   | `infra/terraform/README.md` §2                            |
| GitHub（fine-grained PAT、対象は rimltools だけ） | `TF_PLAN_GITHUB_TOKEN`（Read-only）         | `TF_APPLY_GITHUB_TOKEN`（Read and write） | `infra/terraform/README.md` §3                            |
| Grafana Cloud（access policy）                    | `TF_PLAN_GRAFANA_CLOUD_TOKEN`               | `TF_APPLY_GRAFANA_CLOUD_TOKEN`            | `infra/grafana/README.md` §1                              |

Google OAuth は新しく作らず、既存のクライアントを staging でも使う。次の JSON を用意しておく:

```json
{ "client_id": "<GOOGLE_CLIENT_ID>", "client_secret": "<GOOGLE_CLIENT_SECRET>" }
```

## 3. GitHub に登録する

値をクリップボードにコピーした直後に 1 行ずつ実行する。

```bash
# plan 用（repository secret。PR の plan が使う）
pbpaste | gh secret set TF_PLAN_API_TOKEN -R RimlTempest/rimltools
pbpaste | gh secret set TF_PLAN_CLOUDFLARE_API_TOKEN -R RimlTempest/rimltools
pbpaste | gh secret set TF_PLAN_GITHUB_TOKEN -R RimlTempest/rimltools
pbpaste | gh secret set TF_PLAN_GRAFANA_CLOUD_TOKEN -R RimlTempest/rimltools

# apply 用（production environment の secret。main からの apply だけが読める）
pbpaste | gh secret set TF_APPLY_API_TOKEN -R RimlTempest/rimltools -e production
pbpaste | gh secret set TF_APPLY_CLOUDFLARE_API_TOKEN -R RimlTempest/rimltools -e production
pbpaste | gh secret set TF_APPLY_GITHUB_TOKEN -R RimlTempest/rimltools -e production
pbpaste | gh secret set TF_APPLY_GRAFANA_CLOUD_TOKEN -R RimlTempest/rimltools -e production
pbpaste | gh secret set TF_APPLY_GOOGLE_OAUTH_STAGING -R RimlTempest/rimltools -e production   # 上の JSON

# 秘密ではない値（repository variable）
gh variable set TF_CLOUD_ORGANIZATION -R RimlTempest/rimltools --body '<org>'
gh variable set CLOUDFLARE_ACCOUNT_ID -R RimlTempest/rimltools --body '<account id>'
gh variable set TF_VAR_ACCESS_EMAILS -R RimlTempest/rimltools --body '["<あなたのメールアドレス>"]'
gh variable set GRAFANA_ALERT_EMAILS -R RimlTempest/rimltools --body '["<あなたのメールアドレス>"]'
```

`production` environment を main だけに絞る（初回 apply 以降は Terraform が管理するが、それまでの穴を塞ぐ）:
Settings → Environments → production → Deployment branches → Selected branches → `main`。

**確認**

- [ ] `gh secret list -R RimlTempest/rimltools` に `TF_PLAN_*` が 4 件
- [ ] `gh secret list -R RimlTempest/rimltools -e production` に `TF_APPLY_*` が 5 件
- [ ] どの secret も更新日時が今日（空の値で登録されていない）

## 4. 初回 plan を確認する

Actions → Terraform → Run workflow（`develop`）で plan を出す。PR に出す場合は `infra/**` を触る小さな PR でもよい。
**apply する前に `infra/terraform/README.md` §5 のチェックリストをすべて確認する。** 特に次の 3 つ。

- [ ] 既存の本番リソース（Worker 4 つ、D1 2 つ、Custom Domain 2 つ、GitHub の ruleset 2 つ）が **import** になっていて、`destroy` / `must be replaced` が無い
- [ ] zone の ruleset を取り込むことで、ダッシュボードで作ったルールが消えない
- [ ] Grafana の plan で `grafana_cloud_stack` を作ろうとしていない、notification policy の置き換えで消えるルートが無い

plan が 403 で落ちたら、plan 用トークンに足りない **Read** 権限だけを足す（Edit は足さない）。

## 5. 初回 apply（staging だけ有効）

`infra/terraform/terraform.tfvars` は `release_environments = ["staging"]` から始めてある。
この状態で Release PR（develop → main）をマージすると、Terraform が apply される。本番デプロイはまだ動かない。

- Release PR は develop への push のたびに自動で作られる・更新される（タイトルは `chore(release): <日付> (...)`）
- マージ方法は **merge commit**（squash しない）

**確認**

- [ ] Actions の Terraform（`apply` → `apply-grafana`）が成功している
- [ ] `gh variable list -R RimlTempest/rimltools` に `RELEASE_ENVIRONMENTS = ["staging"]` がある
- [ ] Deploy production は、マージのたびに「スキップ」で終わっている（本番は触られていない）

## 6. staging にデプロイして確かめる

1. Actions → Deploy staging → Run workflow（`develop`）。staging の Worker に初めてコードが入る。
   **この 1 回目は smoke で失敗して正常**。staging のドメインがまだ無いため（Custom Domain はコードの入った Worker にしか付かない）。
   upload まで進んでいれば良い
2. `staging_domains_enabled = true` にする PR を出し、Release PR をマージして apply する
3. もう一度 Actions → Deploy staging → Run workflow。今度は smoke まで通る
4. `https://qrcc-staging.tools.riml4i.com` と `https://noter-staging.tools.riml4i.com` を開く

**確認**

- [ ] Cloudflare Access のログイン画面が出て、登録したメールアドレスで入れる
- [ ] Google でサインインできる（staging 用の `BETTER_AUTH_SECRET` と OAuth が入っている）
- [ ] Deploy staging の smoke（CLI と実ブラウザ）が通っている
- [ ] Grafana の「RimlTools / 概要」ダッシュボードに staging の trace とログが出ている

## 7. production を有効にする

`release_environments = ["staging", "production"]` にする PR を出し、Release PR をマージして apply する。
このマージでの Deploy production は、多くの場合スキップされる（apply が変数を書くより先に、デプロイ側の判定が終わるため）。
ただし 2 つのワークフローは並行して走るので、タイミングによってはデプロイが始まる。その場合も §8 と同じ段階リリース（0% での検証 → カナリア、悪化すれば自動で旧版に戻る）で出るので、Actions の Deploy production を開いて見守る。

**確認**

- [ ] `RELEASE_ENVIRONMENTS` が `["staging","production"]` になっている

## 8. 最初の本番リリース

次の Release PR（develop に何か入ったあとに自動で更新される）をマージする。
段階リリースが走る（`docs/release.md`）。Actions の Deploy production を開いて見守る。

1. 新しい版を 0% で並べ、本番ドメインで smoke（ブルーグリーン検証）
2. 10% → 50% → 100%。段ごとに版別のエラー率を比べる
3. 悪化していれば自動で旧版に戻る。判定できなければ `needs-human` で止まる → Actions の Deploy production を Run workflow（`promote` / `rollback` / `resume`）

**確認**

- [ ] `https://qrcc.riml4i.com` / `https://noter.riml4i.com`（旧 URL）が引き続き動く
- [ ] `https://qrcc.tools.riml4i.com` / `https://noter.tools.riml4i.com`（新 URL）でも開ける
- [ ] Grafana の概要ダッシュボードに production の版が出ている
- [ ] ポータルを出したら `pending_tools = []` にする PR → apply（`tools.riml4i.com` が付き、監視対象になる）

止まったとき・戻したいときは `docs/runbooks/rollback.md`。

## 9. ドメインを移す

`infra/terraform/README.md` の「ドメイン移行」を 1 段ずつ。要点だけ:

1. 新 URL で Google サインインが通ることを確かめる（§1-4 でリダイレクト URI は足してある）
2. `legacy_hosts_mode = "detached"` → Release PR → apply
3. **続けて** `legacy_hosts_mode = "redirect"` → Release PR → apply（旧 URL が 301 で新 URL へ）。2 と 3 を 1 回にまとめると失敗する
4. 数週間後、Google の旧リダイレクト URI を消す

## 10. 監視を仕上げる

1. Grafana → Observability → Application →「Enable metrics generation」（Terraform では設定できない）
2. `infra/grafana/terraform.tfvars` で `metrics_push_enabled = true` → Release PR → apply（5 分ごとの転送と「転送停止」アラートが有効になる）
3. オンコールを使うなら `oncall_usernames = ["<Grafana のユーザー名>"]`。Grafana IRM のモバイルアプリを入れて通知を受け取れるか試す
4. `infra/terraform/terraform.tfvars` で `ops_issues_enabled = true`（障害・無料枠・エラーバジェットの Issue を自動で起票する）
5. ドメイン移行を終えたら、`infra/grafana/terraform.tfvars` の `synthetic_host_overrides` を空にする（新ドメインを監視する）

## 11. 後片付け

- [ ] マージ済みの `feat/release` ブランチを消す（`! git push origin --delete feat/release`）
- [ ] 旧名の repository secret が残っていれば消す（`infra/terraform/README.md` §4 の末尾）
- [ ] 旧リポジトリ（archive 済みの qrcc2 / noter2）の environment secret を消すか、Cloudflare 側で旧デプロイトークンを失効させる
- [ ] 手元の旧ディレクトリ（`~/orca/projects/qrcc2`、`~/orca/projects/noter`）を片付ける

## 困ったとき

| 症状                                  | 見るところ                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| plan / apply が 403                   | トークンの権限（各 README の表）。plan 用には Read だけを足す                                       |
| Deploy がすべてスキップされる         | `RELEASE_ENVIRONMENTS` に環境が入っているか（§5・§7）                                               |
| staging の smoke が 403               | Access の service token（staging environment の `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`） |
| 段階リリースが `needs-human` で止まる | `docs/runbooks/rollback.md`（理由ごとの見分け方）                                                   |
| 無料枠に近づいた                      | `docs/runbooks/free-tier-exhausted.md`                                                              |
| トークンが漏れた                      | `docs/runbooks/secret-leak.md`                                                                      |
