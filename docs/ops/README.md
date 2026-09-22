# 運用（ops）の索引

監視・SLO・障害対応に関するものの置き場所。設計の理由は ADR-0007（SLO）と ADR-0008（監視）。

| 知りたいこと                                                                  | 見るところ                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------- |
| Worker とブラウザが何を送るか（trace / log / Faro、サンプリング、相関の約束） | [telemetry.md](telemetry.md)                      |
| Grafana の見方・アラート・オンコール・ローカルでの試し方                      | [grafana.md](grafana.md)                          |
| SLO とエラーバジェット、release-freeze の運用                                 | [../slo.md](../slo.md)                            |
| 障害・無料枠の枯渇・秘密の漏洩・ロールバックの手順                            | [../runbooks/](../runbooks/README.md)             |
| ダッシュボードの正本（JSON）                                                  | [`ops/dashboards/`](../../ops/dashboards)         |
| ローカルの Grafana LGTM（docker compose）                                     | [`ops/local/`](../../ops/local/README.md)         |
| 定期ジョブ・指標の転送のスクリプト                                            | [`scripts/ops/`](../../scripts/ops/README.md)     |
| Grafana Cloud を管理する OpenTofu                                             | [`infra/grafana/`](../../infra/grafana/README.md) |

GitHub Actions のワークフロー:

| ワークフロー      | 役割                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `ops.yml`         | 30 分ごとの外形監視、6 時間ごとの SLO・無料枠の集計と Issue の更新 |
| `ops-metrics.yml` | 5 分ごとに Cloudflare の指標を Grafana（Mimir）へ送る              |
