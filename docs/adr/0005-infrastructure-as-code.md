# ADR-0005: インフラは Terraform（HCP Terraform Free）、コードの版は wrangler

- 状態: 採用（2026-09-22）

## 決定

- `infra/terraform/` に Cloudflare と GitHub のリソースを置き、state は HCP Terraform Free（500 リソースまで、ロック・履歴・暗号化あり）。
  R2 backend は使わない（ADR-0009: 利用上限を設定できない）。
- 境界: **Terraform = 長く生きる枠と設定、wrangler = コードの版と配信割合**。
  Worker は `cloudflare_worker`（コードを持たない枠）で作り、`cloudflare_worker_version` / `cloudflare_workers_deployment` は使わない。
  wrangler.jsonc には `routes` を書かない（Custom Domain は Terraform の `cloudflare_workers_custom_domain`）。
- 既存リソース（D1 `qrcc` / `noter`、Worker 4 つ、Custom Domain 2 つ）は `import` ブロックで取り込み、作り直さない。
- CI 用の Cloudflare API トークンは Terraform が最小権限で発行し、GitHub の environment secret に直接書き込む。
  人がトークン値を扱うのはブートストラップの 2 本（Terraform 実行用の Cloudflare トークン、GitHub トークン）だけ。
- PR で `terraform plan`（HCP の speculative plan）、main マージで apply。

## 手で行う作業（1 回だけ）

`infra/terraform/README.md` の「ブートストラップ」。

## 実装メモ（2026-09-22）

- 既存リソースの import は `imports.tf` で、名前 → ID を data source（`cloudflare_workers` / `cloudflare_d1_databases` /
  `cloudflare_workers_custom_domains` / `cloudflare_rulesets`）から引く。存在しないもの（新しいツール）は作成される。
- workspace は HCP の **Local execution mode**。runner で plan / apply し、state だけを HCP に置く。
- Worker の枠は observability・workers.dev・preview URL の差分を無視する（wrangler.jsonc が正本で、versions upload のたびに上書きされるため）。
- 旧ホストの移行は `legacy_hosts_mode = attached → detached → redirect` の 3 段階。Custom Domain が作った DNS レコードと
  リダイレクト用のレコードが同名で衝突するため、1 回の apply では切り替えられない。
- GitHub の environment variable は空値を持てないので、production の `WORKER_SUFFIX` は作らない。
