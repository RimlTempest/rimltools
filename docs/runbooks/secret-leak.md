# secret が漏れた・漏れた疑い

**まず失効させる。調査はその後。** 漏れた値を「消したから大丈夫」とは考えない（fork・キャッシュ・ログに残る）。

## 0. どこから漏れたか分からなくても

1. 下の表で該当する secret を失効 → 再発行する
2. GitHub の Security → Secret scanning alerts を確認し、対応後に close する
3. 履歴に残った値は、失効させたうえで放置してよい（履歴の書き換えは最後の手段）

## 1. secret ごとの手順

| secret                                                      | 置き場所                                          | 失効                                                                                                          | 再発行                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare API トークン（CI 用）                            | GitHub environment `staging` / `production`       | Cloudflare ダッシュボード → My Profile → API Tokens → Roll / Delete                                           | Terraform が発行している: `terraform apply -replace=<トークンのリソース>`（`infra/terraform/README.md`）。新しい値は Terraform が environment secret に直接書き込む |
| Cloudflare Analytics トークン                               | environment `ops`（`CLOUDFLARE_ANALYTICS_TOKEN`） | 同上                                                                                                          | Account Analytics: Read だけの権限で作り直し、environment `ops` に登録                                                                                              |
| Terraform 用ブートストラップトークン（Cloudflare / GitHub） | HCP Terraform の workspace 変数                   | Cloudflare: API Tokens で Roll。GitHub: Settings → Developer settings → Tokens で削除                         | 作り直して HCP Terraform の変数を更新（sensitive）                                                                                                                  |
| `BETTER_AUTH_SECRET`                                        | 各プロダクトの Worker secret                      | 新しい値に差し替えると、既存のセッションはすべて無効になる（全員ログアウト）                                  | `openssl rand -base64 32` の値を `wrangler secret put BETTER_AUTH_SECRET`（各プロダクトの docs/deployment.md）                                                      |
| `GOOGLE_CLIENT_SECRET`                                      | 各プロダクトの Worker secret                      | Google Cloud Console → 認証情報 → OAuth クライアント → シークレットをリセット                                 | 新しい値を `wrangler secret put GOOGLE_CLIENT_SECRET`                                                                                                               |
| `GITHUB_TOKEN`（Actions）                                   | 自動発行                                          | ジョブ終了で失効する。漏洩が疑われたら、そのワークフローを止めて原因（ログ出力・`persist-credentials`）を直す | —                                                                                                                                                                   |

- `wrangler secret put` は対話入力なので、自分の端末で実行する（`!` シェルは非対話で空の値が入る）。
- 再発行後は、該当ツールの smoke（`bun run --cwd products/<tool> smoke`）とログインを確認する。

## 2. 影響を調べる

- Cloudflare: ダッシュボード → Manage Account → Audit Log で、漏洩後の API 操作を確認する
- GitHub: Settings → Security log / Organization の audit log
- D1: 不審な書き込みがないか、該当期間のデータを確認する

## 3. 振り返り

[incident.md](incident.md) §4 のテンプレートで記録する。検知できた層（push protection / gitleaks / lefthook / 人）と、
すり抜けた層を書き、多重防御（docs/platform.md §5）のどこを強めるかを決める。
