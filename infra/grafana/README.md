# infra/grafana — Grafana Cloud（LGTM + IRM + Synthetic + Faro）を Terraform で管理する

設計は `docs/adr/0008-observability.md`、使い方は `docs/observability-grafana.md`。
state は HCP Terraform の workspace `rimltools-observability`（execution mode: Local）。

## 管理しているもの

| ファイル         | 内容                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `stack.tf`       | スタック（`create_stack = false` なら既存スタックを参照だけ）、Terraform 用 service account                                   |
| `access.tf`      | 用途別の access policy とトークン（OTLP 書き込み ×2 環境、metrics push、data source 読み取り、Faro 管理、Synthetic 書き込み） |
| `datasources.tf` | `rt-mimir` / `rt-loki` / `rt-tempo`（exemplar・trace ↔ log・service graph の相関つき）                                        |
| `dashboards.tf`  | フォルダ `RimlTools` と `observability/dashboards/*.json`                                                                     |
| `alerts.tf`      | アラートルール（エラー率・カナリア・CPU・無料枠・外形監視・転送停止・レイテンシ）                                             |
| `slo.tf`         | ツールごとの可用性 SLO とレイテンシ SLO（burn rate アラートは Grafana が生成）                                                |
| `oncall.tf`      | IRM（週替わりのローテーション・escalation・Grafana Alerting 連携）、contact point、notification policy                        |
| `synthetic.tf`   | Synthetic Monitoring の導入と HTTP チェック                                                                                   |
| `faro.tf`        | Frontend Observability の app（ツールごと）                                                                                   |
| `github.tf`      | GitHub Actions への受け渡し（下の「契約」）                                                                                   |

## 1. ブートストラップ（人が 1 回だけ行う）

1. **Grafana Cloud のアカウントを作る**（Free、カード不要）。サインアップ時にスタックが 1 つできる。
   slug を `terraform.tfvars` の `stack_slug` に合わせる（既定 `rimltools`）。
   新しく作らせたいなら `create_stack = true`、`stack_region` を指定する。
2. **Cloud access policy を 2 つ作る**（Grafana Cloud Portal → Access Policies、realm は組織全体）。
   - `rimltools-terraform-apply`: `stacks:read` `stacks:write` `accesspolicies:read` `accesspolicies:write`
     `accesspolicies:delete` `stack-service-accounts:write`（provider docs の要件）。トークンを 1 本発行する。
   - `rimltools-terraform-plan`: `stacks:read` `accesspolicies:read`。トークンを 1 本発行する。
3. **HCP Terraform** に workspace `rimltools-observability` を作る（Execution Mode: **Local**）。
   `infra/terraform` と同じ organization でよい。既存の `TF_PLAN_API_TOKEN` / `TF_APPLY_API_TOKEN`
   （team token）がこの workspace にも触れるように権限を足す。
4. **GitHub に登録する**（`!` シェルは非対話なので、値をクリップボードに入れてから `pbpaste` で渡す）:

   ```bash
   # plan 用（読み取り専用、repository secret）
   pbpaste | gh secret set TF_PLAN_GRAFANA_CLOUD_TOKEN -R RimlTempest/rimltools
   # apply 用（書き込み、production environment の secret。main からの apply だけが読める）
   pbpaste | gh secret set TF_APPLY_GRAFANA_CLOUD_TOKEN -R RimlTempest/rimltools -e production
   # 通知先（どちらか。IRM を使うなら Grafana のユーザー名、使わないならメール）
   gh variable set GRAFANA_ONCALL_USERNAMES -R RimlTempest/rimltools --body '["riml"]'
   gh variable set GRAFANA_ALERT_EMAILS -R RimlTempest/rimltools --body '["you@example.com"]'
   ```

   GitHub のトークン（`TF_PLAN_GITHUB_TOKEN` / `TF_APPLY_GITHUB_TOKEN`）は `infra/terraform` と共用。

5. **初回 plan を確認する**（PR の `terraform grafana plan` コメント）。見る点:
   - `grafana_cloud_stack` を作ろうとしていない（`create_stack = false` のとき）
   - `grafana_notification_policy` が既存のポリシーを置き換えること（UI で作ったルートは消える）
6. **Application Observability の metrics generation を有効にする**（Terraform では設定できない）:
   Grafana → Observability → Application → 「Enable metrics generation」。trace から
   `traces_spanmetrics_*`（エンドポイント別 p99）と service graph が作られる。
7. 転送を動かしたら `metrics_push_enabled = true`（`terraform.tfvars`）にする。
   Actions の変数 `GRAFANA_METRICS_PUSH_ENABLED` が true になり、5 分ごとの転送と「転送停止」アラートが有効になる。

`apply` の順序: `infra/terraform`（environment を作る）→ `infra/grafana`（environment に secret を書く）。
`terraform.yml` の `apply-grafana` は `apply` の後に走る。

## 2. 契約（他のレーンとの受け渡し）

| 置き場所                                       | 名前                                            | 中身                                                                   | 使う側                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| environment `production` / `staging` の secret | `GRAFANA_OTLP_HEADERS`                          | `Authorization=Basic%20<base64(stack id:token)>`（URL エンコード済み） | Worker secret `OTEL_EXPORTER_OTLP_HEADERS` にそのまま注入（リリースレーン、docs/observability-grafana.md の対応表） |
| 同 variable                                    | `GRAFANA_OTLP_ENDPOINT`                         | スタックの OTLP gateway（`…/otlp`）                                    | 同上。Worker 側は `/v1/traces` `/v1/logs` を足す                                                                    |
| environment `ops` の secret                    | `GRAFANA_METRICS_PUSH_URL` / `_USER` / `_TOKEN` | OTLP gateway、スタック ID、`metrics:write` のトークン                  | `.github/workflows/observability.yml`                                                                               |
| repository variable                            | `FARO_URL_<TOOL>`                               | Faro の collector URL                                                  | 各プロダクトのビルド（Faro SDK の `url`）                                                                           |
| repository variable                            | `GRAFANA_METRICS_PUSH_ENABLED`                  | `true` / `false`                                                       | `observability.yml` の実行可否                                                                                      |

テレメトリの属性（F1 `@rimltools/telemetry` と共有、変えない）:

- resource: `service.name` = Worker 名（例 `qrcc-web`）、`service.namespace` = `rimltools`、
  `deployment.environment.name` = `production|staging|preview`、`service.version` = git SHA、
  `cloudflare.worker.version_id`
- ログは `trace_id` / `span_id` を持つ（OTLP なら structured metadata、JSON 本文なら `"trace_id":"…"`）
- Faro の `app.name` = ツール名

## 3. 既知の制約

- **plan 用トークンでも state は読める。** state には Terraform 用 service account のトークンと、
  各 access policy のトークンが入る（`infra/terraform` と同じ構造上の限界）。緩和策は fork の PR に
  secret が渡らないことと、漏洩時に `terraform apply -replace=...` で作り直すこと（docs/runbooks/secret-leak.md）。
- **checkov は `alerts.tf` を読めない**（属性名 `for` を解析できず、黙ってスキップする）。
  アラート定義なのでセキュリティ上の検査対象は含まない。
- **notification policy はスタックに 1 つ。** UI で足したルートは次の apply で消える。
- Synthetic Monitoring の導入（`grafana_synthetic_monitoring_installation`）は import できないが、
  既に導入済みのスタックにそのまま適用できる（provider docs）。
