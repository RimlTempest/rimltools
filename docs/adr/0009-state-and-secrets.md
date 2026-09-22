# ADR-0009: state は OpenTofu の暗号化 + 自前 backend、秘密は SOPS

- 状態: 採用（2026-09-22）。ADR-0005 の「state は HCP Terraform Free」を置き換える

## 背景

- HCP Terraform Free は管理リソースが 500 個まで。いまの見込みは 150〜200 個で、ツール 1 つにつき約 25 個増える。
  ツールが 12〜13 個に増えたところで上限に届く
- HCP の state には CI トークンや Grafana のトークンが平文で入り、HCP が保管時に暗号化する（こちらは鍵を持たない）
- 手で GitHub に登録する secret が 10 個前後あり、`!` シェルが非対話なために登録ミス（空の値）が起きやすい

## 決定

1. **CLI は OpenTofu**（`tofu`、mise で版を固定）。provider は registry.opentofu.org から取る
2. **state は OpenTofu のネイティブ暗号化**（`encryption` ブロック、PBKDF2 → AES-GCM、`enforced = true`）で、
   state と plan を runner の上で暗号化してから送る。パスフレーズは `var.state_passphrase`（ephemeral、32 文字以上）
3. **backend は自前の http backend**（`infra/tfstate`、Worker `rimltools-tfstate` + D1）。
   R2 と KV は使わない（各プロダクトの ADR-0009）。この Worker だけは wrangler で直接デプロイする（state で state を管理しない）
   - Worker は暗号文を保存するだけで復号しない。平文らしい state は 422 で拒否する（多重防御）
   - 資格情報は読み取り用（GET のみ）と書き込み用の 2 組（どちらも 32 文字以上）。書き込みはロックの持ち主だけ
   - DELETE は受け付けない（405）。書き込み用の資格情報が漏れても state と履歴は消せない
   - 版は直近 20 版と作成から 7 日以内の版を残す（どちらかを満たせば残す）。上書きの連打で履歴を押し出せない。
     7 日以内の版が 500 または合計 1 GiB を超えたら、古い版を消さずに書き込みを 507 で拒否する（fail-closed）
   - 認証の失敗は `tfstate_auth_failed` として Grafana（Loki）に送り、10 分に 20 回を超えたらアラート。
     Free の rate limiting はこの Worker に掛けられない（1 本を `/api/auth/` に使っている）ため、長さと検知で守る
4. **秘密の入力値は SOPS（age）でリポジトリに暗号化して置く**（`infra/secrets/{plan,apply}.sops.yaml`）
   - `plan.sops.yaml`（読み取り専用の資格情報）は plan 鍵と apply 鍵の両方で、`apply.sops.yaml`（書き込み用）は apply 鍵だけで開ける
   - GitHub に登録するのは age の秘密鍵 2 本だけ: `SOPS_AGE_KEY_PLAN`（repository secret）と `SOPS_AGE_KEY_APPLY`（production environment）
   - 平文のコミットは lefthook（pre-commit）と CI（security-gate）の `scripts/check-secrets.ts` が止める

### OpenTofu への渡し方: `sops exec-env` を採る

| 方式                                              | 良い点                                                                                                  | 問題                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| carlpett/sops provider（`sops_file` data source） | tofu の中で完結する                                                                                     | provider の認証情報・backend の資格情報・暗号化パスフレーズは、provider が初期化される**前**に要る。data source では間に合わない。復号した値が data source として state にも入る |
| **`sops exec-env`**（採用）                       | tofu を起動するコマンドの環境変数にだけ渡す（`TF_VAR_*`・`TF_HTTP_*`）。ファイルにも state にも書かない | CI のステップに 1 行増える。値は GitHub の secret ではないので自動では伏せ字にならず、使う前に `::add-mask::` する                                                               |

## 鍵で何が読めるか

| 鍵 / 資格情報                      | 読めるもの                                                                                                   | 書けるもの                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| plan 鍵（repository secret）       | `plan.sops.yaml`（読み取り専用トークン・tfstate の読み取り資格情報・state のパスフレーズ）→ **state の中身** | なし                                                                                                          |
| apply 鍵（production environment） | `plan.sops.yaml` と `apply.sops.yaml` → state の中身                                                         | Cloudflare・GitHub・Grafana・state                                                                            |
| tfstate の資格情報だけ             | 暗号化された state（パスフレーズが無ければ読めない）                                                         | write 資格情報なら上書きできる（削除は不可。直近 20 版と 7 日以内の版は消えないので戻せる。連打は上限で 507） |
| state のパスフレーズだけ           | 暗号化された state を手に入れられれば、その中身                                                              | なし                                                                                                          |

- plan は state を復号しないと差分を出せないので、**plan 鍵が漏れると state の中身（CI トークンの値など）は読める**。
  構造上の限界で、fork からの PR には secret が渡らないこと・漏洩時の作り直し手順（`docs/runbooks/secret-leak.md`）で緩和する
- 暗号文は public リポジトリの履歴に残る。age 鍵が漏れたら、そこに入っていた秘密はすべて作り直す

## 結果

- 上限なしで無料（Workers と D1 の無料枠で数リクエスト / 実行）。外部サービスへの依存は HCP が消え、Cloudflare だけになる
- **失うと戻せないもの**: age の秘密鍵 2 本と state のパスフレーズ。パスワードマネージャーに控えることをブートストラップの必須手順にする
- ロックは tfstate Worker の D1。Worker が止まると plan / apply もできない（本番のアプリには影響しない）
