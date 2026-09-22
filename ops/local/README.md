# ローカルの Grafana LGTM

本番（Grafana Cloud、`infra/grafana`）と同じダッシュボード・同じデータソース（uid）・同じ相関の設定で、
メトリクス・ログ・トレースを手元で確かめるための docker compose。

```
ブラウザ ─ Faro ──▶ faro（Alloy, :12347）──▶┐
                                            ├─▶ lgtm（otel-lgtm）
Worker（wrangler / vite dev）─ OTLP/HTTP ─▶ :4318 ─┘   ├ OTel Collector
                                                      ├ Tempo（metrics-generator: span metrics・service graph）
                                                      ├ Loki
                                                      ├ Prometheus（本番の Mimir の代わり + recording rules）
                                                      └ Grafana（:3000、RimlTools フォルダに本番と同じダッシュボード）
```

## 起動と確認

```bash
docker compose -f observability/local/compose.yaml up -d   # colima 等で docker-compose なら docker-compose -f ...
bun scripts/observability/local-smoke.ts                   # trace / log / span metrics / recording rule / Faro を確かめる
open http://127.0.0.1:3000                                  # 匿名で閲覧できる（Explore も可）。編集は admin / admin
docker compose -f observability/local/compose.yaml down -v  # 片付け（-v でデータも消す）
```

## アプリから送る

各アプリの `.dev.vars`（`.dev.vars.example` を写して作る。コミットしない）で、コメントアウトしてある
次の行を有効にしてから `bun run dev` する。未設定なら何も送らない。

| 変数                          | 値                               | 意味                                                                          |
| ----------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318`          | Worker の trace と log の送り先。ヘッダ（`OTEL_EXPORTER_OTLP_HEADERS`）は不要 |
| `FARO_URL`                    | `http://127.0.0.1:12347/collect` | ブラウザ（Faro）の送り先                                                      |
| `DEPLOYMENT_ENV`              | `local`                          | ダッシュボードの環境で `local` を選ぶと見える                                 |
| `OTEL_TRACES_SAMPLER_ARG`     | `1`                              | 全リクエストを送る（本番の既定は 0.1）                                        |
| `FARO_SAMPLE_RATE`            | `1`                              | 全セッションで Faro を動かす（本番の既定は 0.2）                              |

送り先は原則 https だけを受け付け、`127.0.0.1` / `localhost` / `[::1]` に限って http を許す
（`@rimltools/telemetry` の `isAllowedCollectorUrl`）。Faro の受け口は `localhost:5173` / `4173`
（vite dev / preview）からのリクエストだけを許可している。

## 本番との違い

- **メトリクス**: 本番は Cloudflare GraphQL の値を `rimltools_worker_*` として Mimir に送る
  （`scripts/observability/push-metrics.ts`）。ローカルには GraphQL が無いので、Tempo の span metrics
  から同じ名前・同じラベルの系列を recording rule で作る（`prometheus/recording-rules.yaml`）。
  `environment` は常に `local`。CPU 時間（`rimltools_worker_cpu_time_ms`）は span に無いので作らず、
  そのパネルは空になる。wall time の分位点は、5 分窓に 2 本以上のリクエストが来てから値が出る
- **Synthetic Monitoring / IRM / SLO** は Grafana Cloud の機能なので、ローカルには無い
- **保持**: `lgtm-data` volume に残る。`down -v` で消える

## イメージを上げるとき

`compose.yaml` のタグと digest を、公開から 7 日以上経った版に更新する（docs/security.md）。
otel-lgtm を上げたら、`prometheus/prometheus.yaml` を新しいイメージの `/otel-lgtm/prometheus.yaml`
と見比べて写し直す（末尾の `rule_files` 以外は上流のまま）。そのあと `local-smoke.ts` で確かめる。
