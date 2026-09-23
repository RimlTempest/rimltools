# infra/secrets — SOPS で暗号化した資格情報

OpenTofu（infra/terraform・infra/grafana）に渡す秘密の値を、SOPS（age）で暗号化して置く（ADR-0009）。
GitHub に登録する secret は、これを開くための age の秘密鍵 2 本だけ。

| ファイル          | 中身                   | 開ける鍵          | CI で使う場所                         |
| ----------------- | ---------------------- | ----------------- | ------------------------------------- |
| `plan.sops.yaml`  | 読み取り専用の資格情報 | plan 鍵・apply 鍵 | PR の plan（`SOPS_AGE_KEY_PLAN`）     |
| `apply.sops.yaml` | 書き込み用の資格情報   | apply 鍵だけ      | main の apply（`SOPS_AGE_KEY_APPLY`） |
| `*.example.yaml`  | ひな形（値は空）       | —                 | —                                     |

キーは環境変数名そのもの（`TF_VAR_*`、`TF_HTTP_*`）。CI は `sops exec-env` で、tofu を実行するコマンドの環境変数にだけ渡す。

## 編集する

```bash
export SOPS_AGE_KEY_FILE=~/.config/sops/age/rimltools-apply.txt   # apply 鍵ならどちらのファイルも開ける
sops infra/secrets/apply.sops.yaml     # エディタで開き、保存時に暗号化される
bun scripts/check-secrets.ts           # 平文が混ざっていないこと
```

- **平文のファイルを置かない**。ここに置けるのは暗号化済みの `*.sops.yaml`、値が空の `*.example.yaml`、この README だけで、
  それ以外は lefthook の pre-commit と CI の security-gate が止める
- キー名を `_unencrypted` で終わらせない（sops はその値を暗号化しない。検査も止める）
- 鍵を足した・替えたときは `sops updatekeys infra/secrets/<file>.sops.yaml`
- 漏洩したときは `docs/runbooks/secret-leak.md`
