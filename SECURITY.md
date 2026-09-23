# Security Policy

## 脆弱性の報告

RimlTools（`*.tools.riml4i.com`）とこのリポジトリの脆弱性は、**公開 Issue ではなく**
GitHub の [Private vulnerability reporting](https://github.com/RimlTempest/rimltools/security/advisories/new)
から報告してください。

- 受領の連絡: 7 日以内
- 修正の目安: 重大（critical / high）は 30 日以内、それ以外は次の定期リリース
- 修正の公開後に GitHub Security Advisory で内容を公開し、報告者を記載します（希望しない場合を除く）

## 対象

| 対象   | 範囲                                                                  |
| ------ | --------------------------------------------------------------------- |
| 本番   | `qrcc.tools.riml4i.com`、`noter.tools.riml4i.com`、`tools.riml4i.com` |
| コード | このリポジトリの `main` / `develop`                                   |

staging（`*-staging.tools.riml4i.com`）への負荷試験・DoS、他の利用者のデータへのアクセス、
ソーシャルエンジニアリングは行わないでください。

## 対応しているバージョン

常に `main`（本番）だけです。過去のリリースへのバックポートはしません。

防御の全体像は [`docs/security.md`](docs/security.md) を参照してください。
