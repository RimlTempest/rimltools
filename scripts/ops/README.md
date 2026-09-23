# scripts/ops

運用（SRE・監視）のスクリプト。SLO の定期ジョブは `.github/workflows/ops.yml`、Cloudflare の指標を Grafana へ送る転送は `.github/workflows/ops-metrics.yml`。方針は [docs/slo.md](../../docs/slo.md)、ADR-0007 / ADR-0008。全体の索引は [docs/ops/README.md](../../docs/ops/README.md)。

| ファイル                                                                                | 役割                                                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `synthetic-cli.ts`                                                                      | 30 分ごとの外形監視。失敗したら 60 秒後に再確認し、2 回続けば `incident` Issue                     |
| `report-cli.ts`                                                                         | 6 時間ごとの SLO / エラーバジェット / 無料枠の集計、ダッシュボード・freeze・free-tier Issue の更新 |
| `probe.ts`                                                                              | ページ・アセット・ツール固有確認（`EXTRA_CHECKS`）の実行（fetch / sleep を注入）                   |
| `slo.ts` `quota.ts` `incident.ts` `report.ts` `synthetic.ts` `config.ts` `analytics.ts` | 純関数（テストあり）                                                                               |
| `push-metrics.ts` `metrics.ts` `otlp.ts`                                                | 5 分ごとに Cloudflare GraphQL の指標を OTLP で Mimir へ送る（`ops-metrics.yml`）                   |
| `dashboards.ts`                                                                         | `ops/dashboards/*.json` の整合性検査（データソース uid の参照など）                                |
| `local-smoke.ts`                                                                        | ローカル LGTM（`ops/local/compose.yaml`）の起動確認                                                |
| `lib/`                                                                                  | GitHub REST / Cloudflare GraphQL の最小クライアント、JSON ガード、環境変数                         |

ローカルで試す（Issue は触らない）:

```bash
OPS_HOST_OVERRIDES='{"qrcc":"qrcc.riml4i.com","noter":"noter.riml4i.com","portal":""}' \
  OPS_RETRY_DELAY_MS=2000 bun run scripts/ops/synthetic-cli.ts
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bun run scripts/ops/report-cli.ts
```

## 共通の部品

- Cloudflare の API は `scripts/lib/cloudflare.ts` だけを使う（リリースと共通）。GraphQL のエラー本文を
  自分で解釈したい転送（`push-metrics.ts`）は `graphqlBody`、それ以外は `graphql`。
- HTML から資産を拾うのは `scripts/lib/html-assets.ts`（範囲は `ASSET_SCOPES.synthetic`）。

## TODO

- Durable Objects の使用量（`durableObjectsInvocationsAdaptiveGroups`）を無料枠の表に足す。
