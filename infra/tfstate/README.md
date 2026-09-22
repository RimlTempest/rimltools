# infra/tfstate — OpenTofu の state 置き場（Worker + D1）

`infra/terraform` と `infra/grafana` の state を置く、OpenTofu の http backend（ADR-0009）。
Worker `rimltools-tfstate` が `https://tfstate.tools.riml4i.com/states/<name>` で受け、D1 `rimltools-tfstate` に保存する。

- **本文は OpenTofu が暗号化した JSON**（AES-GCM、鍵は PBKDF2 でパスフレーズから導出）。Worker は復号しない
- 平文らしい state（`encrypted_data` / `encryption_version` が無い、`resources` などの平文のキーがある）は **422 で拒否**する
- 受け付けるパスは `/states/rimltools-production` と `/states/rimltools-observability` だけ（他は 404、一覧のエンドポイントは無い）
- **DELETE は受け付けない（405）**。書き込み用の資格情報が漏れても、state と版の履歴は消せない。消すときは人が `wrangler d1 execute` で行う（`docs/runbooks/tfstate-restore.md` §5）
- 無料枠: plan / apply 1 回あたり数リクエスト。D1 は数 MB 程度

## 仕組み

| メソッド | 用途                                                        | 必要な資格情報 |
| -------- | ----------------------------------------------------------- | -------------- |
| `GET`    | state を返す（無ければ 204）                                | read / write   |
| `POST`   | state を保存する（`?ID=` がいまのロックと一致したときだけ） | write          |
| `DELETE` | state を消す（同上）                                        | write          |
| `LOCK`   | ロックを取る。取れなければ 423 と持ち主の LockInfo          | write          |
| `UNLOCK` | ロックを外す（持ち主の ID のときだけ）                      | write          |

- 資格情報は Basic 認証の 2 組（読み取り用・書き込み用）。比較は定数時間。**32 文字未満**の値が設定されていたら全リクエストを 500 で拒否する（fail-closed）
- ロックは 1 時間で期限切れになり、奪える（CI が途中で落ちたとき用。すぐ外したいときは `tofu force-unlock <ID>`）
- 本文は 1 MB ごとに分けて保存する（D1 の 1 値の上限 2 MB を超えないため）。書き込みは D1 の batch で 1 回（全部成功か全部失敗）
- 直近 20 版を残す（`state_versions`）。戻し方は `docs/runbooks/tfstate-restore.md`
- ログに出すのは path・method・status・呼び出し元 IP・処理時間だけ。本文・資格情報・Authorization ヘッダは出さない
- 認証の失敗（401 / 403）は `event: "tfstate_auth_failed"`（`result` は `unauthorized` / `forbidden`）でも出し、Grafana のアラートが数える（下の「監視」）

## ブートストラップ（1 回だけ）

state を管理する仕組み自身は state で管理できない（鶏と卵）ので、この Worker だけは wrangler で直接作る。

```bash
cd infra/tfstate

# 1. D1 を作り、出力された database_id を wrangler.jsonc に書く（PR でコミットする）
bunx wrangler d1 create rimltools-tfstate
bunx wrangler d1 migrations apply rimltools-tfstate --remote

# 2. 資格情報を作って Worker の secret に入れる（値はパスワードマネージャーにも控える）
#    ユーザー名は推測されにくい文字列に、パスワードは 32 文字以上に（Worker は短い値を拒否する）
openssl rand -hex 12     # READ_USER / WRITE_USER 用
openssl rand -base64 48  # READ_PASSWORD / WRITE_PASSWORD 用（64 文字）
printf '%s' '<値>' | bunx wrangler secret put READ_USER
printf '%s' '<値>' | bunx wrangler secret put READ_PASSWORD
printf '%s' '<値>' | bunx wrangler secret put WRITE_USER
printf '%s' '<値>' | bunx wrangler secret put WRITE_PASSWORD

# 3. デプロイ（Custom Domain tfstate.tools.riml4i.com も付く）
bunx wrangler deploy
```

**確認**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://tfstate.tools.riml4i.com/states/rimltools-production            # 401
curl -s -o /dev/null -w '%{http_code}\n' -u '<READ_USER>:<READ_PASSWORD>' https://tfstate.tools.riml4i.com/states/rimltools-production  # 204（まだ state が無い）
```

読み取り用の資格情報は `infra/secrets/plan.sops.yaml`、書き込み用は `apply.sops.yaml` の `TF_HTTP_USERNAME` / `TF_HTTP_PASSWORD` に入れる。

## 監視（任意だが推奨）

tfstate Worker は `@rimltools/telemetry` でログと trace を Grafana に送れる（ADR-0008）。
認証の失敗が 10 分で 20 回を超えるとアラート `tfstate-auth-failures`（critical）が鳴る（`infra/grafana/alerts.tf`）。
Free の rate limiting はこの Worker に掛かっていないので、総当たりを検知する手段はこれになる。

infra/grafana を apply したあと（トークンは tfstate 専用の `otlp-write-tfstate`、logs / traces の書き込みだけ）:

```bash
cd infra/grafana
export SOPS_AGE_KEY_FILE=~/.config/sops/age/rimltools-apply.txt
sops exec-env ../secrets/apply.sops.yaml 'tofu init -input=false >/dev/null && tofu output -raw otlp_endpoint' \
  | (cd ../tfstate && bunx wrangler secret put OTEL_EXPORTER_OTLP_ENDPOINT)
sops exec-env ../secrets/apply.sops.yaml 'tofu output -raw tfstate_otlp_headers' \
  | (cd ../tfstate && bunx wrangler secret put OTEL_EXPORTER_OTLP_HEADERS)
```

入れなくても tfstate は動く（何も送らないだけ）。全件を送るので、1 回の plan / apply で数件のログになる
（総当たりを受けても 1 リクエスト 1 行、Grafana Free のログ 50 GB / 月に対して無視できる量）。

**経路の選び方**: Workers Logs を Grafana に直接流す仕組み（Logpush / OTLP export）は Workers Paid 限定。
ops の日次レポートで Workers Logs を集計する方式は検知が最大 1 日遅れるため、総当たりの検知には使わない。

## 開発

```bash
bun run --cwd infra/tfstate test        # handler・D1 ストア（bun:sqlite で D1 を模す）・core のテスト
bun run --cwd infra/tfstate typecheck
```

手元で OpenTofu と組み合わせて試すときは、`.dev.vars` に 4 つの secret を書いて
`bunx wrangler d1 migrations apply rimltools-tfstate --local && bunx wrangler dev` し、
`backend "http"` の address を `http://127.0.0.1:8787/states/rimltools-production` にする。

## 既知の制約

- Cloudflare の rate limiting（Free で 1 本）は `/api/auth/` に使っているので、この Worker には掛かっていない。
  総当たりは資格情報の長さ（32 文字以上のランダム値）で防ぎ、認証失敗のアラートで検知する。WAF の managed ruleset はゾーン全体に効く
- 同じ state への同時書き込みはロックで防ぐ。ロックを取らない書き込み（`-lock=false` の apply）は 409 で拒否する
- 書き込み用の資格情報を持つ者は、20 回書き込めば古い版を押し出せる（直近 20 版だけを残すため）。
  その場合も D1 の Time Travel で過去 7 日の任意の時点に戻せる（`docs/runbooks/tfstate-restore.md` §6）
