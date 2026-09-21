# scripts/ops

SRE の定期ジョブ（`.github/workflows/ops.yml`）。方針は [docs/slo.md](../../docs/slo.md)、ADR-0007。

| ファイル                                                                                | 役割                                                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `synthetic-cli.ts`                                                                      | 30 分ごとの外形監視。失敗したら 60 秒後に再確認し、2 回続けば `incident` Issue                     |
| `report-cli.ts`                                                                         | 6 時間ごとの SLO / エラーバジェット / 無料枠の集計、ダッシュボード・freeze・free-tier Issue の更新 |
| `probe.ts`                                                                              | ページ・アセット・ツール固有確認（`EXTRA_CHECKS`）の実行（fetch / sleep を注入）                   |
| `slo.ts` `quota.ts` `incident.ts` `report.ts` `synthetic.ts` `config.ts` `analytics.ts` | 純関数（テストあり）                                                                               |
| `lib/`                                                                                  | GitHub REST / Cloudflare GraphQL の最小クライアント、JSON ガード、環境変数                         |

ローカルで試す（Issue は触らない）:

```bash
OPS_HOST_OVERRIDES='{"qrcc":"qrcc.riml4i.com","noter":"noter.riml4i.com","portal":""}' \
  OPS_RETRY_DELAY_MS=2000 bun run scripts/ops/synthetic-cli.ts
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bun run scripts/ops/report-cli.ts
```

## TODO（統合）

- `lib/graphql.ts` は、リリース側（canary 判定）が使う `scripts/lib/cloudflare.ts` と同じ GraphQL を叩く。
  両方が develop に入ったら `scripts/lib/` に寄せて 1 つにする。
- Durable Objects の使用量（`durableObjectsInvocationsAdaptiveGroups`）を無料枠の表に足す。
