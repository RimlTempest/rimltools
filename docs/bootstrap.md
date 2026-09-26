# 本番の立ち上げ手順（ブートストラップ）

リポジトリを統合してから本番デプロイを再開するまでに、**人の手で 1 回だけ行う作業**をまとめた手順書。
細かい理由や権限の一覧は、各節からリンクしている README にある。

- 所要時間の目安: 1〜2 時間（DNS と証明書の反映待ちを除く）
- 順番どおりに進める。各段の「確認」が通るまで次へ進まない
- `!` で実行するシェルは非対話なので、トークンの値はクリップボードに入れてから `pbpaste | gh secret set ...` で渡す

## 全体の流れ

| 段  | やること                                      | どこで                               |
| --- | --------------------------------------------- | ------------------------------------ |
| 1   | アカウントと鍵・state の置き場所を用意する    | Grafana Cloud / Cloudflare / 端末    |
| 2   | トークンを作り、SOPS で暗号化してコミットする | Cloudflare / GitHub / Grafana / 端末 |
| 3   | GitHub に age 鍵 2 本と variable を登録する   | 端末                                 |
| 4   | 初回 plan を確認する                          | PR のコメント                        |
| 5   | 初回 apply（デプロイはまだ無効）              | Release PR をマージ                  |
| 6   | production を有効にする                       | PR → Release PR                      |
| 7   | 最初の本番リリース（段階リリース）            | Release PR                           |
| 8   | ドメインを `<tool>.tools.riml4i.com` へ移す   | PR を数回                            |
| 9   | 監視を仕上げる                                | Grafana / PR                         |
| 10  | 後片付け                                      | GitHub / 端末                        |

## 1. アカウント・鍵・state の置き場所

1. **age 鍵を 2 本作る**（SOPS の暗号化に使う。`infra/terraform/README.md` §1）

   ```bash
   mkdir -p ~/.config/sops/age
   age-keygen -o ~/.config/sops/age/rimltools-plan.txt
   age-keygen -o ~/.config/sops/age/rimltools-apply.txt
   ```

   - 出力された公開鍵（`age1...`）で、リポジトリ直下の `.sops.yaml` の placeholder を置き換える（PR でコミットする）
   - **秘密鍵を 2 本ともパスワードマネージャーに控える（必須）**。失うと secrets ファイルを開けなくなる

2. **state の暗号化パスフレーズを作る**: `openssl rand -base64 48`。**パスワードマネージャーに控える（必須）**。失うと state を読めなくなる

3. **state の置き場所（tfstate Worker）を作る**: `infra/tfstate/README.md` のブートストラップ
   （D1 の作成 → migration → 資格情報 4 つを `wrangler secret put` → `wrangler deploy`）。
   **ユーザー名も含めた 4 つとも 32 文字以上**にする（`openssl rand -hex 24` / `openssl rand -base64 48`）。1 つでも短いと Worker が全リクエストを 500 で拒否する。
   D1 の database_id を `infra/tfstate/wrangler.jsonc` に書いて PR でコミットする

4. **Grafana Cloud**（Free、カード不要）
   - サインアップ時にスタックが 1 つできる。**slug は自動生成で、作成後は変更できない**（URL が `https://<slug>.grafana.net`）。
     できた slug を `infra/grafana/terraform.tfvars` の `stack_slug` に書く

5. **Google Cloud Console**（既存の OAuth クライアント）
   - 承認済みのリダイレクト URI に、次を**追加**する（既存の URI は消さない）
     - `https://qrcc.tools.riml4i.com/api/auth/callback/google`
     - `https://noter.tools.riml4i.com/api/auth/callback/google`

## 2. トークンを作り、SOPS で暗号化する

どれも **plan 用（読み取り専用）と apply 用（書き込み）の 2 本**を作る。
PR のコードが動く plan に書き込み権限を渡さないため（`infra/terraform/README.md` のブートストラップ節）。

| サービス                                          | plan 用（`plan.sops.yaml`）                                     | apply 用（`apply.sops.yaml`） | 権限の一覧                     |
| ------------------------------------------------- | --------------------------------------------------------------- | ----------------------------- | ------------------------------ |
| tfstate Worker                                    | 読み取り用の資格情報（`TF_HTTP_USERNAME` / `TF_HTTP_PASSWORD`） | 書き込み用の資格情報          | §1-3 で作ったもの              |
| state の暗号化                                    | `TF_VAR_state_passphrase`（§1-2）                               | 同じ値                        | —                              |
| Cloudflare                                        | 読み取り専用トークン                                            | 書き込みトークン              | `infra/terraform/README.md` §3 |
| GitHub（fine-grained PAT、対象は rimltools だけ） | Read-only                                                       | Read and write                | `infra/terraform/README.md` §3 |
| Grafana Cloud（access policy）                    | plan 用                                                         | apply 用                      | `infra/grafana/README.md` §1   |

> **Grafana は後回しにできる**（§9）。その場合は access policy を作らず、secrets ファイルから
> `TF_VAR_grafana_cloud_access_policy_token` の**行ごと消す**。空文字は sops が暗号化しないので、
> 残すと `bun scripts/check-secrets.ts` が「平文が残っている」と判定して落ちる。

```bash
cp infra/secrets/plan.example.yaml  infra/secrets/plan.sops.yaml
cp infra/secrets/apply.example.yaml infra/secrets/apply.sops.yaml
# 値を入れたら、すぐに暗号化する（平文のままコミットしようとすると pre-commit が止める）
sops encrypt -i infra/secrets/plan.sops.yaml
sops encrypt -i infra/secrets/apply.sops.yaml
bun scripts/check-secrets.ts   # 平文が混ざっていないこと
```

暗号化した 2 ファイルと `.sops.yaml` を PR でコミットする。以後の編集は `sops infra/secrets/apply.sops.yaml`（保存時に暗号化される）。

## 3. GitHub に登録する

**GitHub に置く secret は age の秘密鍵 2 本だけ。** 値をクリップボードにコピーした直後に 1 行ずつ実行する。

```bash
# plan 鍵（repository secret。PR の plan が使う）
pbpaste | gh secret set SOPS_AGE_KEY_PLAN -R RimlTempest/rimltools
# apply 鍵（production environment の secret。main からの apply だけが読める）
pbpaste | gh secret set SOPS_AGE_KEY_APPLY -R RimlTempest/rimltools -e production

# 秘密ではない値（repository variable）
gh variable set CLOUDFLARE_ACCOUNT_ID -R RimlTempest/rimltools --body '<account id>'
gh variable set TF_VAR_ACCESS_EMAILS -R RimlTempest/rimltools --body '["<あなたのメールアドレス>"]'
gh variable set GRAFANA_ALERT_EMAILS -R RimlTempest/rimltools --body '["<あなたのメールアドレス>"]'
```

`production` environment を main だけに絞る（初回 apply 以降は Terraform が管理するが、それまでの穴を塞ぐ）:
Settings → Environments → production → Deployment branches → Selected branches → `main`。

**確認**

- [ ] `gh secret list -R RimlTempest/rimltools` に `SOPS_AGE_KEY_PLAN` がある
- [ ] `gh secret list -R RimlTempest/rimltools -e production` に `SOPS_AGE_KEY_APPLY` がある
- [ ] どちらも更新日時が今日（空の値で登録されていない）
- [ ] 旧方式（HCP Terraform）の secret（`TF_PLAN_*` / `TF_APPLY_*`）が残っていない

## 4. 初回 plan を確認する

Actions → Terraform → Run workflow（`develop`）で plan を出す。PR に出す場合は `infra/**` を触る小さな PR でもよい。
**apply する前に `infra/terraform/README.md` §6 のチェックリストをすべて確認する。** 特に次の 3 つ。

- [ ] 既存の本番リソース（Worker 4 つ、D1 2 つ、Custom Domain 2 つ、GitHub の ruleset 2 つ）が **import** になっていて、`destroy` / `must be replaced` が無い
- [ ] zone の ruleset を取り込むことで、ダッシュボードで作ったルールが消えない
- [ ] Grafana の plan で `grafana_cloud_stack` を作ろうとしていない、notification policy の置き換えで消えるルートが無い

plan が 403 で落ちたら、plan 用トークンに足りない **Read** 権限だけを足す（Edit は足さない）。
plan が「SOPS age key ... is not set up yet」で飛ばされたら、§2 のファイルと §3 の鍵を確かめる。

## 5. 初回 apply（デプロイはまだ無効）

`infra/terraform/terraform.tfvars` は `release_environments = []` から始めてある。
この状態で Release PR（develop → main）をマージすると、Terraform が apply される。デプロイはまだ動かない。

- Release PR は develop への push のたびに自動で作られる・更新される（タイトルは `chore(release): <日付> (...)`）
- マージ方法は **merge commit**（squash しない）

**確認**

- [ ] Actions の Terraform（`apply` → `apply-grafana`）が成功している
- [ ] tfstate に state が入った: `curl -s -o /dev/null -w '%{http_code}' -u '<READ_USER>:<READ_PASSWORD>' https://tfstate.tools.riml4i.com/states/rimltools-production` が 200
- [ ] Deploy production は、マージのたびに「スキップ」で終わっている（本番は触られていない）

## 6. production を有効にする

`release_environments = ["production"]` にする PR を出し、Release PR をマージして apply する。
このマージでの Deploy production は、多くの場合スキップされる（apply が変数を書くより先に、デプロイ側の判定が終わるため）。
ただし 2 つのワークフローは並行して走るので、タイミングによってはデプロイが始まる。その場合も §7 と同じ段階リリース（0% での検証 → カナリア、悪化すれば自動で旧版に戻る）で出るので、Actions の Deploy production を開いて見守る。

**確認**

- [ ] `RELEASE_ENVIRONMENTS` が `["production"]` になっている

## 7. 最初の本番リリース

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

## 8. ドメインを移す

`infra/terraform/README.md` の「ドメイン移行」を 1 段ずつ。要点だけ:

1. 新 URL で Google サインインが通ることを確かめる（§1-4 でリダイレクト URI は足してある）
2. `legacy_hosts_mode = "detached"` → Release PR → apply
3. **続けて** `legacy_hosts_mode = "redirect"` → Release PR → apply（旧 URL が 301 で新 URL へ）。2 と 3 を 1 回にまとめると失敗する
4. 数週間後、Google の旧リダイレクト URI を消す

## 9. 監視を仕上げる

Grafana は監視の層なので、デプロイが動くまで後回しにできる。`infra/grafana` の 3 ジョブは
リポジトリ変数 `GRAFANA_ENABLED` が `true` のときだけ走る（既定は無効）。

0. Grafana Cloud の access policy 2 本（§2 の表）を作り、`infra/secrets` の各ファイルに
   `TF_VAR_grafana_cloud_access_policy_token: '<トークン>'` の行を**足して**暗号化し直す
   （`sops infra/secrets/apply.sops.yaml` で開くと、保存時に暗号化される）。そのうえで有効にする:

   ```bash
   gh variable set GRAFANA_ENABLED -R RimlTempest/rimltools --body true
   ```

1. Grafana → Observability → Application →「Enable metrics generation」（Terraform では設定できない）
2. `infra/grafana/terraform.tfvars` で `metrics_push_enabled = true` → Release PR → apply（5 分ごとの転送と「転送停止」アラートが有効になる）
3. オンコールを使うなら `oncall_usernames = ["<Grafana のユーザー名>"]`。Grafana IRM のモバイルアプリを入れて通知を受け取れるか試す
4. `infra/terraform/terraform.tfvars` で `ops_issues_enabled = true`（障害・無料枠・エラーバジェットの Issue を自動で起票する）
5. tfstate Worker に Grafana の送り先を入れる（`infra/tfstate/README.md`「監視」）。tfstate への認証失敗の総当たりを検知できるようになる
6. ドメイン移行を終えたら、`infra/grafana/terraform.tfvars` の `synthetic_host_overrides` を空にする（新ドメインを監視する）

## 10. 後片付け

- [ ] マージ済みの `feat/release` ブランチを消す（`! git push origin --delete feat/release`）
- [ ] 旧名の repository secret が残っていれば消す（`infra/terraform/README.md` §4 の末尾）
- [ ] 旧リポジトリ（archive 済みの qrcc2 / noter2）の environment secret を消すか、Cloudflare 側で旧デプロイトークンを失効させる
- [ ] 手元の旧ディレクトリ（`~/orca/projects/qrcc2`、`~/orca/projects/noter`）を片付ける

## 困ったとき

| 症状                                  | 見るところ                                                    |
| ------------------------------------- | ------------------------------------------------------------- |
| plan / apply が 403                   | トークンの権限（各 README の表）。plan 用には Read だけを足す |
| Deploy がすべてスキップされる         | `RELEASE_ENVIRONMENTS` に環境が入っているか（§5・§7）         |
| 段階リリースが `needs-human` で止まる | `docs/runbooks/rollback.md`（理由ごとの見分け方）             |
| 無料枠に近づいた                      | `docs/runbooks/free-tier-exhausted.md`                        |
| トークンが漏れた                      | `docs/runbooks/secret-leak.md`                                |
