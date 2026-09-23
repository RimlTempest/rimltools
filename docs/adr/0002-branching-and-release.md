# ADR-0002: develop を作業ブランチにし、main へのマージをリリースとする

- 状態: 採用（2026-09-22）

## 決定

| ブランチ                  | 役割     | 入れ方                                                            | デプロイ先                 |
| ------------------------- | -------- | ----------------------------------------------------------------- | -------------------------- |
| `feature/*` `fix/*`       | 作業     | develop から切る                                                  | —                          |
| `develop`（既定ブランチ） | 統合     | PR（squash）。CI の `gate` が green 必須                          | —                          |
| `main`                    | 本番     | **develop からの Release PR（merge commit）** か `hotfix/*` だけ  | production（段階リリース） |
| `hotfix/*`                | 緊急修正 | main から切って main へ PR。マージ後に main → develop を自動で PR | production                 |

- main と develop は ruleset で保護する: PR 必須、required checks、force push・削除禁止、linear history は develop のみ。
- main へ入れられる head ブランチを `develop` と `hotfix/*` に限る（`release-guard` チェック）。
- Release PR は develop への push のたびにワークフローが作成・更新する（本文に含まれる PR と、リリースされるツールを列挙）。
- 1 人運用のため必須レビュー数は 0。代わりに required checks と environment の保護で担保する。

## 理由

「main に入った瞬間に本番へ出る」を唯一の出口にすると、何が本番にあるかが常に main と一致し、
手作業のデプロイが無くなる。事故は main の手前（develop / Release PR の checks）と、
main の後（段階リリースと自動ロールバック）の 2 か所で止める。
