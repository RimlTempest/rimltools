# secret が漏れた・漏れた疑い

**まず失効させる。調査はその後。** 漏れた値を「消したから大丈夫」とは考えない（fork・キャッシュ・ログに残る）。

## 0. どこから漏れたか分からなくても

1. 下の表で該当する secret を失効 → 再発行する
2. GitHub の Security → Secret scanning alerts を確認し、対応後に close する
3. 履歴に残った値は、失効させたうえで放置してよい（履歴の書き換えは最後の手段）

## 1. secret ごとの手順

| secret                                                                       | 置き場所                                                                | 失効                                                                                                                             | 再発行                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare API トークン（CI 用）                                             | GitHub environment `staging` / `production`                             | Cloudflare ダッシュボード → My Profile → API Tokens → Roll / Delete                                                              | Terraform が発行している: `tofu apply -replace=<トークンのリソース>`（`infra/terraform/README.md`）。新しい値は Terraform が environment secret に直接書き込む       |
| Cloudflare Analytics トークン                                                | environment `ops`（`CLOUDFLARE_ANALYTICS_TOKEN`）                       | 同上                                                                                                                             | Account Analytics: Read だけの権限で作り直し、environment `ops` に登録                                                                                               |
| Terraform 用トークン（Cloudflare / GitHub PAT / Grafana、plan 用・apply 用） | `infra/secrets/plan.sops.yaml` / `apply.sops.yaml`                      | Cloudflare: API Tokens で Roll。GitHub: Settings → Developer settings → Tokens で削除。Grafana: Access Policies でトークンを削除 | 作り直して `sops infra/secrets/<file>.sops.yaml` で値を差し替え → PR（§2 も確認）                                                                                    |
| SOPS の plan 鍵（`SOPS_AGE_KEY_PLAN`）                                       | repository secret / パスワードマネージャー                              | GitHub の secret を削除                                                                                                          | §2-1                                                                                                                                                                 |
| SOPS の apply 鍵（`SOPS_AGE_KEY_APPLY`）                                     | `production` environment の secret / パスワードマネージャー             | GitHub の secret を削除                                                                                                          | §2-1（apply 鍵は全部を開けるので、`plan.sops.yaml` の中身も作り直す）                                                                                                |
| state の暗号化パスフレーズ（`TF_VAR_state_passphrase`）                      | 両方の secrets ファイル                                                 | —                                                                                                                                | §2-2                                                                                                                                                                 |
| tfstate の資格情報（`TF_HTTP_USERNAME` / `TF_HTTP_PASSWORD`）                | Worker `rimltools-tfstate` の secret / secrets ファイル                 | —                                                                                                                                | §2-3                                                                                                                                                                 |
| `BETTER_AUTH_SECRET`                                                         | 各プロダクトの Worker secret                                            | 新しい値に差し替えると、既存のセッションはすべて無効になる（全員ログアウト）                                                     | `openssl rand -base64 32` の値を `wrangler secret put BETTER_AUTH_SECRET`（各プロダクトの docs/deployment.md）                                                       |
| `GOOGLE_CLIENT_SECRET`                                                       | 各プロダクトの Worker secret                                            | Google Cloud Console → 認証情報 → OAuth クライアント → シークレットをリセット                                                    | 新しい値を `wrangler secret put GOOGLE_CLIENT_SECRET`                                                                                                                |
| Access の service token（staging の smoke 用）                               | environment `staging` / `preview`（`CF_ACCESS_CLIENT_ID` / `_SECRET`）  | Zero Trust → Access → Service Auth → Service Tokens で Revoke                                                                    | `tofu apply -replace=cloudflare_zero_trust_access_service_token.ci[0]`。新しい値は Terraform が environment secret に書く。有効期限は 1 年（期限前に同じ手順で更新） |
| staging の `BETTER_AUTH_SECRET`                                              | environment `staging` / `preview`（`APP_SECRETS`）                      | —（staging のセッションが全員ログアウトになるだけ）                                                                              | `tofu apply -replace='random_password.better_auth_staging["<tool>"]'` → 次の staging リリースで版に載る                                                              |
| staging の Google OAuth クライアント                                         | `apply.sops.yaml` の `TF_VAR_google_oauth_staging_json` → `APP_SECRETS` | Google Cloud Console でシークレットをリセット                                                                                    | `sops infra/secrets/apply.sops.yaml` で新しい JSON に差し替え → PR → apply → staging リリース                                                                        |
| `GITHUB_TOKEN`（Actions）                                                    | 自動発行                                                                | ジョブ終了で失効する。漏洩が疑われたら、そのワークフローを止めて原因（ログ出力・`persist-credentials`）を直す                    | —                                                                                                                                                                    |

- `tofu apply -replace=...` を手元で行うときは `sops exec-env infra/secrets/apply.sops.yaml '...'` で包む（apply 鍵が要る）。
  手元に apply 鍵を出したくなければ、`-replace` 相当の変更を PR にして Release PR で apply する。
- `wrangler secret put` は対話入力なので、自分の端末で実行する（`!` シェルは非対話で空の値が入る）。
- 再発行後は、該当ツールの smoke（`bun run --cwd products/<tool> smoke`）とログインを確認する。

## 2. SOPS の鍵・state のパスフレーズ・tfstate の資格情報

### 2-1. age 鍵が漏れた

その鍵で開けるファイルに入っていた値は**すべて漏れた**とみなす（plan 鍵なら `plan.sops.yaml`、apply 鍵なら両方）。
暗号文は public リポジトリの履歴に残っているので、鍵を替えるだけでは足りない。

1. 中身の値を 1 つずつ失効・再発行する（§1 の表。plan 鍵なら読み取り専用のトークンと tfstate の読み取り資格情報、
   **state のパスフレーズ**も含む → §2-2・§2-3）
2. 新しい鍵を作る: `age-keygen -o ~/.config/sops/age/rimltools-<plan|apply>.txt`。パスワードマネージャーの控えも差し替える
3. `.sops.yaml` の公開鍵を差し替え、受信者を更新する:

   ```bash
   sops updatekeys infra/secrets/plan.sops.yaml
   sops updatekeys infra/secrets/apply.sops.yaml
   # updatekeys は受信者だけを替える。中のデータ鍵は古い鍵で開けたままなので、必ず作り直す
   sops rotate -i infra/secrets/plan.sops.yaml
   sops rotate -i infra/secrets/apply.sops.yaml
   ```

4. 1 で再発行した値を `sops infra/secrets/<file>.sops.yaml` で入れ、PR にする
5. GitHub の secret を新しい鍵で上書きする: `pbpaste | gh secret set SOPS_AGE_KEY_PLAN -R RimlTempest/rimltools`（apply 鍵は `-e production` で `SOPS_AGE_KEY_APPLY`）

### 2-2. state のパスフレーズが漏れた

パスフレーズだけでは読めない（暗号化された state も要る）。ただし plan 鍵が漏れた場合は両方が揃うので、必ず作り直す。
過去の版（tfstate が直近 20 版を残す）は古いパスフレーズで暗号化されたままなので、作り直したあと消す。

1. 新しいパスフレーズを作る（`openssl rand -base64 48`、控える）
2. 両方の `versions.tf`（infra/terraform・infra/grafana）の `encryption` に、古い鍵を fallback として足す PR を出す:

   ```hcl
   key_provider "pbkdf2" "state_old" {
     passphrase = var.state_passphrase_old
   }
   method "aes_gcm" "state_old" {
     keys = key_provider.pbkdf2.state_old
   }
   state {
     method   = method.aes_gcm.state
     enforced = true
     fallback {
       method = method.aes_gcm.state_old
     }
   }
   # plan にも同じ fallback を足す。variable "state_passphrase_old" も（sensitive, ephemeral）
   ```

3. secrets ファイルの `TF_VAR_state_passphrase` を新しい値に、`TF_VAR_state_passphrase_old` に古い値を入れる
4. Release PR で apply する。OpenTofu は古い鍵で読み、新しい鍵で書き直す
5. fallback と `state_passphrase_old` を消す PR を出す
6. 古い版を消す（新しい鍵の版だけを残す。`docs/runbooks/tfstate-restore.md` の SQL で `state_versions` を確認してから）:

   ```bash
   cd infra/tfstate
   bunx wrangler d1 execute rimltools-tfstate --remote --command \
     "DELETE FROM state_chunks WHERE (path, version) NOT IN (SELECT path, version FROM states); \
      DELETE FROM state_versions WHERE (path, version) NOT IN (SELECT path, version FROM states);"
   ```

7. state の中の値（CI トークンなど）も漏れたとみなし、§1 の手順で作り直す

### 2-3. tfstate の資格情報が漏れた（または `tfstate-auth-failures` アラートが鳴った）

- **読み取り用**: 暗号化された state が読まれる（パスフレーズが無ければ中身は読めない）。資格情報を替える
- **書き込み用**: state を上書きされ得る（DELETE は受け付けないので削除はできない）。資格情報を替えたうえで、`docs/runbooks/tfstate-restore.md` で
  `state_versions` に見覚えの無い版が無いか確かめ、あれば直前の正しい版に戻す。
  20 版を超えて押し出されていたら、同じ runbook の §6（D1 Time Travel、過去 7 日）で戻す

資格情報の替え方:

```bash
cd infra/tfstate
openssl rand -base64 48 | tr -d '\n' | bunx wrangler secret put WRITE_PASSWORD   # READ_* / WRITE_USER も同様
```

新しい値を `sops infra/secrets/<file>.sops.yaml` の `TF_HTTP_USERNAME` / `TF_HTTP_PASSWORD` に入れて PR にする。
Worker の secret を替えた瞬間から、古い値の CI は 401 になる（PR のマージまで plan / apply が止まる）。

## 3. 影響を調べる

- Cloudflare: ダッシュボード → Manage Account → Audit Log で、漏洩後の API 操作を確認する
- GitHub: Settings → Security log / Organization の audit log
- D1: 不審な書き込みがないか、該当期間のデータを確認する

## 4. 振り返り

[incident.md](incident.md) §4 のテンプレートで記録する。検知できた層（push protection / gitleaks / lefthook / 人）と、
すり抜けた層を書き、多重防御（docs/platform.md §5）のどこを強めるかを決める。
