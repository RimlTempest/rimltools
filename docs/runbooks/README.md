# Runbooks

障害・運用の手順書。まず何が起きているかを [運用ダッシュボード Issue](https://github.com/RimlTempest/rimltools/issues?q=is%3Aissue+is%3Aopen+label%3Aops-dashboard) で確認する。

| 状況                                          | 手順書                                               | きっかけ                              |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| 本番がおかしい / `incident` Issue が立った    | [incident.md](incident.md)                           | synthetic 監視、利用者の報告          |
| リリースを戻したい                            | [rollback.md](rollback.md)                           | canary の自動判定、手動判断           |
| 無料枠が尽きそう / 尽きた / `free-tier` Issue | [free-tier-exhausted.md](free-tier-exhausted.md)     | report（6 時間ごと）                  |
| secret が漏れた・漏れた疑い                   | [secret-leak.md](secret-leak.md)                     | secret scanning、gitleaks、人の気づき |
| OpenTofu の state を前の版に戻したい          | [tfstate-restore.md](tfstate-restore.md)             | state の破損・誤った上書き            |
| `release-freeze` Issue が立った               | [../slo.md#release-freeze](../slo.md#release-freeze) | エラーバジェット枯渇                  |

関連: [SLO とエラーバジェット](../slo.md) / [プラットフォーム設計](../platform.md) / ADR-0003（段階リリース）/ ADR-0007（SRE）
