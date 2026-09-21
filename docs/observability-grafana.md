# 監視（Grafana Cloud）の使い方

設計の理由は `docs/adr/0008-observability.md`、Terraform は `infra/grafana/README.md`。

## どこを見るか

| 知りたいこと                           | 見る場所                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| 全体が健康か・無料枠は大丈夫か         | ダッシュボード **RimlTools / 概要**                                    |
| 段階リリース中の新しい版は大丈夫か     | 概要の「カナリア（版ごとの比較）」行                                   |
| あるツールのどのエンドポイントが遅いか | **RimlTools / ツール詳細** → 「エンドポイント別 p99」                  |
| 遅い・失敗したリクエストの中身         | ツール詳細の「遅いリクエスト」「エラーになったリクエスト」（Tempo）    |
| そのリクエストのログ                   | trace の span から「Logs for this span」（同じ trace_id の Loki）      |
| ログから trace へ                      | ログ行の詳細の「trace を開く」（derived field）                        |
| グラフの外れ値から trace へ            | エンドポイント別 p99 の点（exemplar）をクリック                        |
| 実利用者の体感（LCP / INP / CLS）      | ツール詳細の「フロントエンド」行、または Frontend Observability アプリ |
| SLO とエラーバジェット                 | Grafana → SLO（ツールごとに可用性とレイテンシ）                        |
| 今の当番                               | Grafana → IRM → Schedules → RimlTools                                  |

## 指標の定義

`scripts/observability/push-metrics.ts` が Cloudflare GraphQL（`workersInvocationsAdaptive`、
`d1AnalyticsAdaptiveGroups`）から作る。値は **5 分窓ごとの集計**を窓の終わりの時刻で送った gauge。

| 指標                                                    | ラベル                                           | 意味                                                                 |
| ------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `rimltools_worker_requests`                             | tool, environment, script, version, status_class | 窓内の invocation 数                                                 |
| `rimltools_worker_errors`                               | 同上                                             | Cloudflare が数えたエラー数                                          |
| `rimltools_worker_subrequests`                          | 同上                                             | サブリクエスト数                                                     |
| `rimltools_worker_cpu_time_ms`                          | 同上 + quantile（0.5 / 0.99）                    | CPU time の分位点                                                    |
| `rimltools_worker_wall_time_ms`                         | 同上 + quantile（0.5 / 0.9 / 0.99）              | wall time の分位点（取れる場合）                                     |
| `rimltools_workers_requests_today`                      | —                                                | 今日（UTC）のアカウント全体の Workers リクエスト（無料枠 100k / 日） |
| `rimltools_d1_rows_read_today` / `_written_today`       | database                                         | 今日の D1 行読み取り / 書き込み                                      |
| `rimltools_metrics_push_last_success_timestamp_seconds` | —                                                | 転送の最終成功時刻                                                   |

- `status_class` は `ok`（success / clientDisconnected）と `error`（それ以外）の 2 値。series を増やさないため。
- 分位点は窓ごとの値なので、**窓をまたいで平均してはいけない**（ダッシュボードは max で束ねている）。
- `scriptVersion` と `wallTime*` は docs で存在を確認できなかったため、スキーマに無いと GraphQL が
  エラーを返したら、確認済みのフィールド（`scriptName` / `status` / `cpuTimeP50` / `cpuTimeP99`）で取り直す。
  そのときは版ごとの比較と wall time のパネルが空になる（ログに `using the basic set` が出る）。

エンドポイント別の p99 は trace 由来（Tempo metrics-generator の `traces_spanmetrics_*`）。
trace は tail sampling（エラーと遅いものは全件、それ以外は一部）なので、**件数とレートは実数より少なく、
p99 は遅い側に偏る**。傾向と比較に使い、SLO の判定は Cloudflare 由来の指標で行う。

## アラートと当番

| severity | 例                                                                                          | 通知                                                         |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| critical | エラー率 > 2%（30 分）、新しい版だけエラーが多い、外形監視の失敗、無料枠 90%、SLO fast burn | IRM の critical chain（最初から important、10 分後に再通知） |
| warning  | CPU p99 > 8ms、レイテンシ p99 超過、無料枠 70%、転送停止、SLO slow burn                     | IRM の default chain（通知 → 30 分後に important）           |

- IRM を使わない（`oncall_usernames` が空）間は、同じ内容をメールで送る。
- 対応手順は `docs/runbooks/`。アラートの `runbook_url` から開ける。
- 当番の交代・代理は IRM の Schedules で上書きする（web overrides を有効にしてある）。

## 無料枠

| 項目             | 上限（Free）            | 見積もり             |
| ---------------- | ----------------------- | -------------------- |
| active series    | 10k                     | 約 1.7k              |
| logs             | 50 GB / 月（14 日保持） | 約 1 GB              |
| traces           | 50 GB / 月（14 日保持） | 約 0.7 GB            |
| Synthetic（API） | 100k 回 / 月            | 25,920 回            |
| Frontend（Faro） | 50k セッション / 月     | SDK 側でサンプリング |
| IRM              | 3 ユーザー              | 1 人                 |

前提としたトラフィック: 本番全体で 30k リクエスト / 日、1 リクエストあたりログ 1 行（600 B）、
trace は 1 日 3k 件 × 8 span × 1 KB、Faro は 1 日 1k セッション × 30 イベント × 500 B。

series の内訳:

- 転送（push-metrics）: Worker 8（本番 4 + staging 4）× 版 2 × status_class 2 × 指標 8 ≒ 256、D1 と当日合計 ≒ 10
- span metrics: 本番 4 service × span 名 10 × status 1.3 × histogram 約 17 bucket ≒ 900、calls / size などで +300
- Synthetic: 3 チェック × 約 50
- SLO の recording rule: 4 SLO × 約 20

**span 名は低カーディナリティにすること**（`GET /api/codes/:id` のようにルートのテンプレートにする。
実際の ID や URL をそのまま span 名にすると series が爆発する）。これは `@rimltools/telemetry` の約束。

## 統合時の TODO

- レイテンシの目標（`infra/grafana` の `latency_p99_ms`）を `tools.json` の `slo.latencyP99Ms` に移す
  （`scripts/lib/tools.ts` とテストも更新）。
- `D1_DATABASE_NAMES`（repository variable）を `infra/terraform` が D1 の ID から作る。
- リリース（段階リリース）で Grafana に annotation（tag `deploy`、`tool`、`version`）を打つ。
  ダッシュボードは既に `deploy` タグの annotation を表示する。
- Faro のクエリ（Web Vitals パネル）は、初回データが入ったら LogQL の形を確認する。
