# ADR-0008: 監視は Grafana Cloud Free（LGTM + IRM + Synthetic + Faro）を Terraform で管理する

- 状態: 採用（2026-09-22）

## 背景

メトリクス・ログ・トレースを相関させて調べ、p99 などのパフォーマンスを見て、オンコールで受けられる
ようにしたい。無料枠で運用しきることが前提（Cloudflare は Workers Free、各プロダクトの ADR-0009）。

- Workers 標準の OpenTelemetry export（traces / logs）は **Workers Paid 限定**。Free では使えない。
- Workers は metrics の OTLP export を持たない（Paid でも未対応）。
- LGTM を自前でホストするとサーバー代がかかる。

## 決定

**Grafana Cloud Free** を使い、Grafana 側の設定はすべて `infra/grafana`（Terraform）で持つ。

| 信号                        | 送り方                                                                                            | 保存先       |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------ |
| traces                      | Worker 内の軽量 OTLP/JSON 送信（`@rimltools/telemetry`、tail sampling）                           | Tempo        |
| logs                        | 同上（`trace_id` / `span_id` 付き）                                                               | Loki         |
| metrics（Workers / D1）     | GitHub Actions の cron が Cloudflare GraphQL を読み、OTLP で送る（`scripts/ops/push-metrics.ts`） | Mimir        |
| metrics（エンドポイント別） | Tempo の metrics-generator（span metrics / service graph）                                        | Mimir        |
| 実利用者（Web Vitals など） | Grafana Faro Web SDK                                                                              | Loki / Tempo |
| 外形監視                    | Grafana Synthetic Monitoring（HTTP、1 probe・5 分間隔）                                           | Mimir        |
| オンコール                  | Grafana Cloud IRM（Free は 3 ユーザー）                                                           | —            |

- 相関: Mimir の exemplar → Tempo、Tempo → Loki（同じ trace_id）/ Mimir（span metrics）、Loki → Tempo。
  自前の data source（`rt-mimir` / `rt-loki` / `rt-tempo`）に設定し、ダッシュボードはこの 3 つだけを使う。
- SLO: Grafana SLO（可用性 = invocation の成功率、レイテンシ = 5 分窓の p99 が目標以下だった時間の割合）。
  burn rate アラートは Grafana が生成する。
- アラートは severity で振り分ける（critical は最初から important 通知、warning は 30 分後に important）。
- Workers Paid に移ったら、traces / logs は Workers 標準の OTLP export（`observability.traces.destinations`）に
  切り替えられる。送り先と属性（`service.name` など）を同じにしてあるので、ダッシュボードとアラートはそのまま使える。

## 無料枠の試算（docs/ops/grafana.md §無料枠）

| 項目             | 上限（Free）        | 見積もり                                                          | 割合  |
| ---------------- | ------------------- | ----------------------------------------------------------------- | ----- |
| active series    | 10k                 | 約 1.7k（転送 ~270、span metrics ~1.2k、Synthetic ~150、SLO ~80） | ~17%  |
| logs             | 50 GB / 月          | ~1 GB（Worker ~0.55 GB + Faro ~0.45 GB）                          | ~2%   |
| traces           | 50 GB / 月          | ~0.7 GB                                                           | ~1.5% |
| Synthetic（API） | 100k 回 / 月        | 25,920 回（3 チェック × 288 回 / 日）                             | ~26%  |
| Frontend（Faro） | 50k セッション / 月 | トラフィック次第（SDK 側でサンプリング）                          | —     |
| IRM              | 3 ユーザー          | 1 人                                                              | —     |

Cloudflare 側: 転送は GraphQL なので Workers のリクエストを消費しない。Synthetic は 1 日 864 回
（3 チェック）で Workers 100k / 日 の 0.9%。Worker 内の OTLP 送信は `waitUntil` のサブリクエストで、
リクエスト数には数えられない（CPU 時間は使うので、tail sampling で送る量を絞る）。

## 採らなかった案

- **LGTM の自前ホスト**: サーバー代がかかる。無料枠の方針に反する。
- **Workers Logpush / OTLP export**: Workers Paid 限定。
- **Cloudflare の Workers Observability だけ**: 相関分析・SLO・オンコールが無い。保持も 3 日。
