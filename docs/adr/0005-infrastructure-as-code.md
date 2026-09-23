# ADR-0005: インフラは Terraform（OpenTofu）、コードの版は wrangler

- 状態: 採用（2026-09-22）。state と秘密の扱いは ADR-0009 で変更（HCP Terraform → OpenTofu + 自前 backend + SOPS）

## 決定

- `infra/terraform/` に Cloudflare と GitHub のリソースを置く。~~state は HCP Terraform Free~~ → ADR-0009（OpenTofu の暗号化 + 自前 backend）。
  R2 backend は使わない（各プロダクトの ADR-0009: 利用上限を設定できない）。
- 境界: **Terraform = 長く生きる枠と設定、wrangler = コードの版と配信割合**。
  Worker は `cloudflare_worker`（コードを持たない枠）で作り、`cloudflare_worker_version` / `cloudflare_workers_deployment` は使わない。
  wrangler.jsonc には `routes` を書かない（Custom Domain は Terraform の `cloudflare_workers_custom_domain`）。
- 既存リソース（D1 `qrcc` / `noter`、Worker 4 つ、Custom Domain 2 つ）は `import` ブロックで取り込み、作り直さない。
- CI 用の Cloudflare API トークンは Terraform が最小権限で発行し、GitHub の environment secret に直接書き込む。
  人がトークン値を扱うのはブートストラップだけで、その値は SOPS で暗号化してリポジトリに置く（ADR-0009）。
- PR で `tofu plan`（読み取り専用、`-lock=false`）、main マージで apply。

## 手で行う作業（1 回だけ）

`infra/terraform/README.md` の「ブートストラップ」。

## 実装メモ（2026-09-22）

- 既存リソースの import は `imports.tf` で、名前 → ID を data source（`cloudflare_workers` / `cloudflare_d1_databases` /
  `cloudflare_workers_custom_domains` / `cloudflare_rulesets`）から引く。存在しないもの（新しいツール）は作成される。
- ~~workspace は HCP の Local execution mode~~ → state は `infra/tfstate` の http backend（ADR-0009）。
- Worker の枠は observability・workers.dev・preview URL の差分を無視する（wrangler.jsonc が正本で、versions upload のたびに上書きされるため）。
- 旧ホストの移行は `legacy_hosts_mode = attached → detached → redirect` の 3 段階。Custom Domain が作った DNS レコードと
  リダイレクト用のレコードが同名で衝突するため、1 回の apply では切り替えられない。
- GitHub の environment variable は空値を持てないので、production の `WORKER_SUFFIX` は作らない。
- plan（PR、レビュー前のコード）と apply（main）で資格情報を分ける。plan は plan 鍵（repository secret）で `plan.sops.yaml`、
  apply は apply 鍵（`production` environment の secret）で `apply.sops.yaml` を開く（ADR-0009）。

## 変更（2026-09-22、ADR-0009）

HCP Terraform Free の管理リソース上限（500）と、state を手元で暗号化できない点から、CLI を OpenTofu に、
state を自前の http backend（`infra/tfstate`、OpenTofu のネイティブ暗号化）に、秘密の入力値を SOPS に移した。
ディレクトリ名 `infra/terraform` とワークフロー名 `Terraform` は変えていない。
