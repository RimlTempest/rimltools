# 無料枠が尽きそう / 尽きた

Workers Free の上限は**アカウント全体**で共有し、00:00 UTC（09:00 JST）にリセットされる。
上限に達しても課金はされず、エラーになるだけ（Workers は 1027、D1 は書き込み失敗）。

## 1. どれが枯れているかを見る

- `free-tier` Issue / 運用ダッシュボードの「無料枠」表（本日分は途中経過）
- Cloudflare ダッシュボード → Workers & Pages → 各 Worker の Metrics、D1 → Metrics
- どのツールが食っているか: ダッシュボードの Workers requests はツール別に分かれていないので、
  Cloudflare ダッシュボードで Worker ごとのリクエスト数を比べる

## 2. 縮退する（ツールごとの手順）

各プロダクトは上限に近づいたときの縮退動作を持っている。**既に開いている人の作業を止めない**のが共通の原則。

| ツール | 縮退の設計                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| qrcc   | [products/qrcc/docs/free-tier-budget.md §3](../../products/qrcc/docs/free-tier-budget.md)（未ログインの保存 API 停止、履歴記録の停止を feature flag で切り替え） |
| noter  | [products/noter/docs/free-tier-budget.md §4](../../products/noter/docs/free-tier-budget.md)（同期上限の表示、ローカル保存への誘導）                              |
| portal | 対応不要（Static Assets のみ。無料・無制限）                                                                                                                     |

feature flag の切り替えは `flags/<tool>.json` の PR、急ぐときは flags の kill switch ワークフロー（ADR-0004）。

## 3. やってはいけないこと

- **Workers Paid に切り替えない**（ADR-0009）。R2 / KV を足して逃がさない。
- synthetic を止めて節約しない（1 日 150 リクエスト程度＝上限の 0.15%。docs/slo.md の試算）。

## 4. 原因を潰す

- 突発（bot・スクレイピング）なら WAF / rate limiting ルールを Terraform で足す（Free で rate limit 1 本）。
- 恒常的な増加なら、該当プロダクトの free-tier-budget.md の「機能を足すときのチェック」に沿って設計を見直す。
- 振り返りは [incident.md](incident.md) §4 のテンプレートで。
