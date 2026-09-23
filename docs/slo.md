# SLO とエラーバジェット

ADR-0007 の運用ルール。集計と Issue の更新は `.github/workflows/ops.yml`（`scripts/ops/`）が自動で行う。

## SLI（何を測るか）

| SLI      | 定義                                                         | 出どころ                                                              |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| 可用性   | `1 − errors / requests`（ツールに属する全 Worker の合計）    | GraphQL `workersInvocationsAdaptive`（`sum.requests` / `sum.errors`） |
| 外形監視 | ページ本体 200・同一オリジンのアセット 200・ツール固有の確認 | synthetic（30 分ごと）                                                |

- `errors` は Worker の例外・リソース超過など、invocation が success 以外で終わったもの。
  アプリが意図して返した 4xx / 5xx は含まれない（外形監視で補う）。
- ツールに属する Worker は `tools.json` の `workers[].name`（本番名）。

## SLO（目標）

`tools.json` の `slo`（既定: 可用性 **99.5%**、窓 **28 日**）。

| 状態          | 条件                 | 意味                                                             |
| ------------- | -------------------- | ---------------------------------------------------------------- |
| 🟢 healthy    | バジェット消費 < 50% | 通常どおりリリースしてよい                                       |
| 🟡 burning    | 50% ≤ 消費 < 100%    | リリースは続けてよいが、canary の段階を細かくする・bake を延ばす |
| 🔴 exhausted  | 消費 ≥ 100%          | **release-freeze**（下記）                                       |
| ⚪ no-traffic | 窓の中でリクエスト 0 | 判定しない（成功とも失敗とも数えない）                           |

許容失敗数 = `requests × (100 − 目標) / 100`。消費率 = `errors / 許容失敗数`。

## release-freeze

- report が exhausted を検出すると、`release-freeze` ラベル付きの Issue を起票する。
- **契約: open な Issue に `release-freeze` ラベルがあれば freeze。**
  Release PR の checks（release-guard）は、freeze 中に `fix:` / `revert:` 以外のコミットを含むと失敗する。
- 解除は **人が Issue を close して行う**。バジェットが回復すると report がコメントするが、自動では close しない
  （回復の理由を確かめずに機能リリースを再開しないため）。

## 無料枠の監視

Workers Free の上限は**アカウント全体**の日次合計（00:00 UTC リセット）なので、ツール別ではなく合計で見る。

| 項目             | 上限/日   | 警告 |
| ---------------- | --------- | ---- |
| Workers requests | 100,000   | 70%  |
| D1 rows written  | 100,000   | 70%  |
| D1 rows read     | 5,000,000 | 70%  |

警告で `free-tier` ラベルの Issue を起票し、下回ったら自動で close する。
縮退の手順は [runbooks/free-tier-exhausted.md](runbooks/free-tier-exhausted.md)。

> Durable Objects（noter-sync）のリクエスト・行書き込みはまだ集計していない
> （`durableObjectsInvocationsAdaptiveGroups` を足すのが次の一手）。noter 側の見方は
> `apps/noter/docs/free-tier-budget.md` §5。

## 監視自体のコスト

| 項目                             | 回数/日                                       | Workers requests への影響               |
| -------------------------------- | --------------------------------------------- | --------------------------------------- |
| synthetic: qrcc                  | 48 回 × ページ 1                              | 48                                      |
| synthetic: noter                 | 48 回 × (ページ 1 + `/ws/…` 1)                | 96                                      |
| synthetic: portal                | 48 回 × 0（Static Assets のみ＝無料・無制限） | 0                                       |
| synthetic のアセット確認         | 48 回 × 各 ~10                                | 0（Static Assets は無料・無制限）       |
| 失敗時の再確認（60 秒後に 1 回） | 失敗時だけ                                    | 最大で上記の 2 倍                       |
| report（6 時間ごと）             | 4 回                                          | 0（GraphQL API は Worker を起動しない） |

**平常時 144 req/日 = 上限の 0.14%、全ツールが失敗し続けても 288 req/日 = 0.29%。**
（アセットが Static Assets から配信される前提。`run_worker_first` を有効にしたツールはアセット分も数える）
GitHub Actions は public リポジトリなので実行時間は無料。

## 運用ダッシュボード

`ops-dashboard` ラベルの Issue「📊 RimlTools 運用ダッシュボード」を report が 6 時間ごとに上書きする。
手で編集しない（次の実行で消える）。

## 有効化

`ops.yml` は設定が揃うまで「job summary に結果を出すだけ」で動く。

1. repo variable `OPS_ISSUES=true` … Issue の起票・更新を有効にする
2. repo variable `OPS_HOST_OVERRIDES` … 新ドメインへ切り替える前は旧ホストを見る
   （例: `{"qrcc":"qrcc.riml4i.com","noter":"noter.riml4i.com","portal":""}`。空文字は監視しない）
3. environment `ops` に `CLOUDFLARE_ANALYTICS_TOKEN`（Account Analytics: Read のみ）と
   `CLOUDFLARE_ACCOUNT_ID` … report が動く。production の secret は使わない（main 限定のため）

> public リポジトリの schedule は、60 日間 push が無いと GitHub に止められる。止まったら Actions 画面から再開する。
